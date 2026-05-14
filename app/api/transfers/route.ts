import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

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
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const supabase = await createClient()

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
    const { data: counterparty } = await supabase
      .from('wallets')
      .select('user_id')
      .eq('id', toWalletId)
      .single()

    const senderMsg = qrCodeId
      ? `You paid $${amount.toFixed(2)} for ${description ?? 'a payment'}`
      : `You sent $${amount.toFixed(2)}`
    const receiverMsg = qrCodeId
      ? `You received $${amount.toFixed(2)} for ${description ?? 'a payment'}`
      : `You received $${amount.toFixed(2)}`

    await Promise.all([
      supabase.from('notifications').insert({
        user_id: user.id,
        type: 'transaction',
        title: qrCodeId ? 'Payment Sent' : 'Transfer Sent',
        message: senderMsg,
        link_url: '/dashboard/transactions',
      }),
      counterparty?.user_id
        ? supabase.from('notifications').insert({
            user_id: counterparty.user_id,
            type: 'transaction',
            title: qrCodeId ? 'Payment Received' : 'Transfer Received',
            message: receiverMsg,
            link_url: '/dashboard/transactions',
          })
        : Promise.resolve(),
    ])

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: qrCodeId ? 'qr_payment' : 'transfer',
      resource_type: 'transaction',
      resource_id: txn.transaction_id,
      details: { amount, to_wallet_id: toWalletId, qr_code_id: qrCodeId ?? null },
      status: 'success',
    })

    // Low-balance reminder: notify the sender if their wallet dropped below $5
    const LOW_BALANCE_THRESHOLD = 5
    const { data: senderWallet } = await supabase
      .from('wallets')
      .select('balance, name, wallet_number')
      .eq('id', fromWalletId)
      .single()

    if (senderWallet && Number(senderWallet.balance) < LOW_BALANCE_THRESHOLD) {
      const label = senderWallet.name || senderWallet.wallet_number
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'wallet',
        title: 'Low balance',
        message: `${label} is down to $${Number(senderWallet.balance).toFixed(2)}. Top up to keep transacting.`,
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
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

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

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Error fetching transfers:', error)
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 })
  }
}
