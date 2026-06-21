import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification, createServiceRoleClient, notifyAdmins } from '@/lib/notifications'

type CounterpartySnapshot = {
  displayName: string | null
  walletNumber: string | null
}

function formatOwnerName(user: any) {
  if (!user) return null
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || null
}

function formatWalletLabel(snapshot: CounterpartySnapshot | null) {
  if (!snapshot) return null
  if (snapshot.displayName && snapshot.walletNumber) {
    return `${snapshot.displayName} (${snapshot.walletNumber})`
  }
  return snapshot.displayName ?? snapshot.walletNumber
}

async function loadCounterpartySnapshots(
  client: any,
  walletIds: string[],
): Promise<Map<string, CounterpartySnapshot>> {
  const uniqueWalletIds = Array.from(new Set(walletIds.filter(Boolean)))
  if (uniqueWalletIds.length === 0) return new Map<string, CounterpartySnapshot>()

  const { data: wallets } = await client
    .from('wallets')
    .select('id, user_id, wallet_number, name')
    .in('id', uniqueWalletIds)

  const userIds = Array.from(new Set((wallets ?? []).map((w: any) => w.user_id).filter(Boolean)))
  const { data: users } =
    userIds.length > 0
      ? await client
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', userIds)
      : { data: [] }

  const userById = new Map((users ?? []).map((u: any) => [u.id, u]))
  return new Map<string, CounterpartySnapshot>(
    (wallets ?? []).map((wallet: any) => {
      const ownerName = formatOwnerName(userById.get(wallet.user_id))
      return [
        wallet.id,
        {
          displayName: ownerName,
          walletNumber: wallet.name || wallet.wallet_number,
        },
      ]
    }),
  )
}

/**
 * POST /api/transfers
 *
 * Body (one of two shapes):
 *   { from_wallet_id, to_wallet_number, amount, description?, idempotency_key? }
 *   { from_wallet_id, qr_code_id, idempotency_key? }   // amount/recipient/desc derived from QR
 *
 * Atomicity, balance checks, daily-limit checks, idempotency replay and the
 * transactions row are all handled inside the fn_transfer Postgres function.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const body = await request.json()
    const fromWalletId: string | undefined = body.from_wallet_id ?? body.fromWalletId
    const toWalletNumber: string | undefined = body.to_wallet_number ?? body.toWalletNumber
    const qrCodeId: string | undefined = body.qr_code_id ?? body.qrCodeId
    const idempotencyKey: string | null = body.idempotency_key ?? body.idempotencyKey ?? null

    if (!fromWalletId) {
      return NextResponse.json({ error: 'from_wallet_id is required' }, { status: 400 })
    }
    if (!qrCodeId && !toWalletNumber) {
      return NextResponse.json(
        { error: 'Either qr_code_id or to_wallet_number is required' },
        { status: 400 },
      )
    }

    let toWalletId: string
    let amount: number
    let description: string | null = body.description ?? null

    if (qrCodeId) {
      // Resolve QR via SECURITY DEFINER function so we get the row regardless of RLS
      const { data: qrRows, error: qrErr } = await supabase
        .from('qr_codes')
        .select('id, wallet_id, amount, description, is_active, single_use, paid_count, expiry_at')
        .eq('id', qrCodeId)
        .single()

      if (qrErr || !qrRows) {
        return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
      }

      const expired = qrRows.expiry_at && new Date(qrRows.expiry_at) <= new Date()
      const exhausted = qrRows.single_use && qrRows.paid_count > 0
      if (!qrRows.is_active || expired || exhausted) {
        return NextResponse.json({ error: 'QR code is not payable' }, { status: 400 })
      }

      toWalletId = qrRows.wallet_id
      amount = Number(qrRows.amount)
      description = description ?? qrRows.description
    } else {
      const { data: toWallet, error: lookupErr } = await supabase
        .from('wallets')
        .select('id')
        .eq('wallet_number', toWalletNumber!)
        .single()

      if (lookupErr || !toWallet) {
        return NextResponse.json({ error: 'Recipient wallet not found' }, { status: 404 })
      }
      toWalletId = toWallet.id
      amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
      }
    }

    // Atomic transfer via Postgres function
    const { data: result, error: rpcError } = await supabase.rpc('fn_transfer', {
      p_from_wallet_id: fromWalletId,
      p_to_wallet_id: toWalletId,
      p_amount: amount,
      p_description: description,
      p_qr_code_id: qrCodeId ?? null,
      p_idempotency_key: idempotencyKey,
    })

    if (rpcError) {
      // Postgres RAISE EXCEPTION messages come back as `message`
      const status = /Insufficient|limit|not active|same wallet|not found/i.test(rpcError.message)
        ? 400
        : 500
      return NextResponse.json({ error: rpcError.message }, { status })
    }

    const txn = Array.isArray(result) ? result[0] : result
    if (!txn) {
      return NextResponse.json({ error: 'Transfer returned no result' }, { status: 500 })
    }

    // Notifications for both parties (best-effort; doesn't fail the transfer)
    const serviceClient = createServiceRoleClient()
    const notificationClient = serviceClient ?? supabase
    const snapshotClient = serviceClient ?? supabase
    const snapshots = await loadCounterpartySnapshots(snapshotClient, [fromWalletId, toWalletId])
    const senderSnapshot = snapshots.get(fromWalletId) ?? null
    const receiverSnapshot = snapshots.get(toWalletId) ?? null

    await snapshotClient
      .from('transactions')
      .update({
        sender_display_name: senderSnapshot?.displayName ?? null,
        sender_wallet_number: senderSnapshot?.walletNumber ?? null,
        receiver_display_name: receiverSnapshot?.displayName ?? null,
        receiver_wallet_number: receiverSnapshot?.walletNumber ?? null,
      })
      .eq('id', txn.transaction_id)

    const { data: counterparty, error: counterpartyError } = await (serviceClient ?? supabase)
      .from('wallets')
      .select('user_id')
      .eq('id', toWalletId)
      .single()

    if (counterpartyError) {
      console.error('[transfers] receiver lookup for notification failed:', counterpartyError.message)
    }

    const senderMsg = qrCodeId
      ? `You paid P${amount.toFixed(2)} for ${description ?? 'a payment'}`
      : `You sent P${amount.toFixed(2)}`
    const receiverMsg = qrCodeId
      ? `You received P${amount.toFixed(2)} for ${description ?? 'a payment'}`
      : `You received P${amount.toFixed(2)}`

    await Promise.all([
      createNotification(notificationClient, {
        user_id: user.id,
        type: 'transaction',
        category: 'payment',
        title: qrCodeId ? 'Payment Sent' : 'Transfer Sent',
        message: senderMsg,
        link_url: '/dashboard/transactions',
        reference_id: txn.transaction_id,
      }),
      counterparty?.user_id
        ? createNotification(notificationClient, {
            user_id: counterparty.user_id,
            type: 'transaction',
            category: 'payment',
            title: qrCodeId ? 'Payment Received' : 'Transfer Received',
            message: receiverMsg,
            link_url: '/dashboard/transactions',
            reference_id: txn.transaction_id,
          })
        : Promise.resolve(null),
    ])

    await notifyAdmins(supabase, {
      type: 'transaction',
      category: 'payment',
      title: qrCodeId ? 'QR payment completed' : 'Transfer completed',
      message: `${user.email} sent P${amount.toFixed(2)}${qrCodeId ? ' via QR payment' : ''}.`,
      link_url: '/admin',
      reference_id: txn.transaction_id,
    })

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: qrCodeId ? 'qr_payment' : 'transfer',
      resource_type: 'transaction',
      resource_id: txn.transaction_id,
      details: { amount, to_wallet_id: toWalletId, qr_code_id: qrCodeId ?? null },
      status: 'success',
    })

    if (counterparty?.user_id) {
      await notificationClient.from('audit_logs').insert({
        user_id: counterparty.user_id,
        action: qrCodeId ? 'qr_payment_received' : 'transfer_received',
        resource_type: 'transaction',
        resource_id: txn.transaction_id,
        details: { amount, from_wallet_id: fromWalletId, qr_code_id: qrCodeId ?? null },
        status: 'success',
      })
    }

    // Low-balance reminder: notify the sender if their wallet dropped below P5
    const LOW_BALANCE_THRESHOLD = 5
    const { data: senderWallet } = await supabase
      .from('wallets')
      .select('balance, name, wallet_number')
      .eq('id', fromWalletId)
      .single()

    if (senderWallet && Number(senderWallet.balance) < LOW_BALANCE_THRESHOLD) {
      const label = senderWallet.name || senderWallet.wallet_number
      await createNotification(supabase, {
        user_id: user.id,
        type: 'wallet',
        category: 'wallet',
        title: 'Low balance',
        message: `${label} is down to P${Number(senderWallet.balance).toFixed(2)}. Top up to keep transacting.`,
        link_url: `/dashboard/wallets/${fromWalletId}`,
      })
    }

    return NextResponse.json(
      {
        transaction_id: txn.transaction_id,
        reference_id: txn.reference_id,
        status: txn.status,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Error creating transfer:', error)
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 })
  }
}

// GET /api/transfers — full history (sent and received) for caller's wallets
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { data: wallets } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)

    const ids = (wallets ?? []).map((w) => w.id)
    if (ids.length === 0) return NextResponse.json({ transactions: [] })

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .or(
        `from_wallet_id.in.(${ids.join(',')}),to_wallet_id.in.(${ids.join(',')})`,
      )
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const serviceClient = createServiceRoleClient()
    const lookupClient = serviceClient ?? supabase
    const walletLookupIds = Array.from(
      new Set(
        (transactions ?? [])
          .flatMap((t) => [t.from_wallet_id, t.to_wallet_id])
          .filter(Boolean),
      ),
    )
    const liveSnapshots = await loadCounterpartySnapshots(lookupClient, walletLookupIds)

    const nameForWallet = (walletId: string | null) => {
      if (!walletId) return null
      return formatWalletLabel(liveSnapshots.get(walletId) ?? null)
    }

    const enrichedTransactions = (transactions ?? []).map((transaction) => {
      const isGuestCard = transaction.stripe_payment_intent_id && !transaction.from_wallet_id
      const guestPayerLabel = transaction.guest_payer_name || transaction.guest_payer_email
      const senderSnapshotLabel = formatWalletLabel({
        displayName: transaction.sender_display_name,
        walletNumber: transaction.sender_wallet_number,
      })
      const receiverSnapshotLabel = formatWalletLabel({
        displayName: transaction.receiver_display_name,
        walletNumber: transaction.receiver_wallet_number,
      })
      const senderLabel = isGuestCard
        ? guestPayerLabel || 'Guest card payer'
        : senderSnapshotLabel || nameForWallet(transaction.from_wallet_id)
      const receiverLabel = receiverSnapshotLabel || nameForWallet(transaction.to_wallet_id)
      const sourceLabel = isGuestCard
        ? 'Guest card via Stripe'
        : transaction.type === 'topup'
          ? 'Card top-up via Stripe'
          : transaction.qr_code_id
            ? 'Wallet QR payment'
            : transaction.type === 'transfer'
              ? 'Wallet transfer'
              : transaction.type

      return {
        ...transaction,
        source_label: sourceLabel,
        sender_label: senderLabel,
        receiver_label: receiverLabel,
        counterparty_label: transaction.from_wallet_id && ids.includes(transaction.from_wallet_id)
          ? receiverLabel
          : senderLabel,
      }
    })

    return NextResponse.json({ transactions: enrichedTransactions })
  } catch (error) {
    console.error('Error fetching transfers:', error)
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 })
  }
}
