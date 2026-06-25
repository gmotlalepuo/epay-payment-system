import { createNotification, notifyAdmins } from '@/lib/notifications'
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

export type GuestQrPayerDetails = {
  name?: string | null
  email?: string | null
}

type GuestQrApplyResult =
  | {
      credited: true
      amount: number
      currency: string
      reference_id: string
      transaction_id: string
      receiver_wallet_id: string
      description: string
      payer_name?: string | null
      payer_email?: string | null
    }
  | {
      credited: false
      already_credited?: boolean
      reference_id?: string
      reason?: string
    }

function isMissingGuestPayerColumn(error: any) {
  const message = String(error?.message ?? '')
  return (
    error?.code === 'PGRST204' ||
    /guest_payer_(name|email)/i.test(message) ||
    /schema cache/i.test(message)
  )
}

function guestPayerSelectColumns(includePayerDetails: boolean) {
  return includePayerDetails
    ? 'id, reference_id, amount, currency, guest_payer_name, guest_payer_email'
    : 'id, reference_id, amount, currency'
}

function transactionInsertPayload({
  receiverWalletId,
  amount,
  currency,
  paymentIntentId,
  referenceId,
  description,
  qrCodeId,
  completedAt,
  payerDetails,
  includePayerDetails,
}: {
  receiverWalletId: string
  amount: number
  currency: string
  paymentIntentId: string
  referenceId: string
  description: string
  qrCodeId: string
  completedAt: string
  payerDetails: GuestQrPayerDetails
  includePayerDetails: boolean
}) {
  return {
    from_wallet_id: null,
    to_wallet_id: receiverWalletId,
    type: 'payment',
    amount,
    currency,
    status: 'completed',
    stripe_payment_intent_id: paymentIntentId,
    reference_id: referenceId,
    description,
    qr_code_id: qrCodeId,
    completed_at: completedAt,
    ...(includePayerDetails
      ? {
          guest_payer_name: payerDetails.name ?? null,
          guest_payer_email: payerDetails.email ?? null,
        }
      : {}),
  }
}

async function ensureGuestQrReceiverNotification(
  supabase: SupabaseClient,
  payload: {
    transactionId: string
    receiverUserId: string
    amount: number
    currency: string
    payerName?: string | null
  },
) {
  const { data: existingNotification } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', payload.receiverUserId)
    .eq('reference_id', payload.transactionId)
    .eq('title', 'Card payment received')
    .maybeSingle()

  if (existingNotification) return

  const payerLabel = payload.payerName?.trim() || 'a guest card payment'

  await createNotification(supabase, {
    user_id: payload.receiverUserId,
    type: 'transaction',
    category: 'payment',
    title: 'Card payment received',
    message: `You received ${payload.amount.toFixed(2)} ${payload.currency} from ${payerLabel}.`,
    link_url: '/dashboard/transactions',
    reference_id: payload.transactionId,
  })
}

async function refundGuestQrPayment(
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
  reason: string,
) {
  try {
    await stripe.refunds.create({
      payment_intent: paymentIntent.id,
      metadata: {
        reason,
        source: 'guest_qr_payment',
      },
    })
  } catch (error) {
    console.error('[guest-qr-payment] Failed to refund payment:', error)
  }
}

export async function applyGuestQrCardPayment(
  paymentIntent: Stripe.PaymentIntent,
  supabase: SupabaseClient,
  stripe: Stripe,
  payerDetails: GuestQrPayerDetails = {},
): Promise<GuestQrApplyResult> {
  const qrCodeId = paymentIntent.metadata.qr_code_id
  const receiverWalletId = paymentIntent.metadata.receiver_wallet_id
  const receiverUserId = paymentIntent.metadata.receiver_user_id
  const amount =
    paymentIntent.amount_received > 0 ? paymentIntent.amount_received / 100 : paymentIntent.amount / 100

  if (!qrCodeId || !receiverWalletId || !receiverUserId) {
    console.error('[guest-qr-payment] Metadata missing:', paymentIntent.id)
    return { credited: false, reason: 'missing_metadata' }
  }

  let includePayerDetails = true
  let { data: existing, error: existingError }: { data: any; error: any } = await supabase
    .from('transactions')
    .select(guestPayerSelectColumns(includePayerDetails))
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle()

  if (existingError && isMissingGuestPayerColumn(existingError)) {
    includePayerDetails = false
    const fallback: { data: any; error: any } = await supabase
      .from('transactions')
      .select(guestPayerSelectColumns(includePayerDetails))
      .eq('stripe_payment_intent_id', paymentIntent.id)
      .maybeSingle()
    existing = fallback.data
    existingError = fallback.error
  }

  if (existingError) {
    console.error('[guest-qr-payment] Existing transaction lookup failed:', existingError)
  }

  if (existing) {
    const existingPayerName = 'guest_payer_name' in existing ? existing.guest_payer_name : null
    const existingPayerEmail = 'guest_payer_email' in existing ? existing.guest_payer_email : null

    if (includePayerDetails && (payerDetails.name || payerDetails.email) && (!existingPayerName || !existingPayerEmail)) {
      await supabase
        .from('transactions')
        .update({
          guest_payer_name: existingPayerName ?? payerDetails.name ?? null,
          guest_payer_email: existingPayerEmail ?? payerDetails.email ?? null,
        })
        .eq('id', existing.id)
    }

    await ensureGuestQrReceiverNotification(supabase, {
      transactionId: existing.id,
      receiverUserId,
      amount: Number(existing.amount ?? amount),
      currency: existing.currency ?? paymentIntent.currency.toUpperCase(),
      payerName: existingPayerName ?? payerDetails.name,
    })

    return {
      credited: false,
      already_credited: true,
      reference_id: existing.reference_id,
    }
  }

  const { data: qr, error: qrError } = await supabase
    .from('qr_codes')
    .select('id, wallet_id, amount, currency, description, is_active, single_use, paid_count, expiry_at')
    .eq('id', qrCodeId)
    .single()

  if (qrError || !qr || qr.wallet_id !== receiverWalletId) {
    console.error('[guest-qr-payment] QR not found or mismatched:', paymentIntent.id, qrError)
    await refundGuestQrPayment(stripe, paymentIntent, 'qr_not_found_or_mismatched')
    return { credited: false, reason: 'qr_not_found_or_mismatched' }
  }

  const expired = qr.expiry_at && new Date(qr.expiry_at) <= new Date()
  const exhausted = qr.single_use && qr.paid_count > 0
  if (!qr.is_active || expired || exhausted) {
    console.error('[guest-qr-payment] QR is no longer payable:', paymentIntent.id)
    await refundGuestQrPayment(stripe, paymentIntent, 'qr_not_payable')
    return { credited: false, reason: 'qr_not_payable' }
  }

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('balance, currency, status')
    .eq('id', receiverWalletId)
    .single()

  if (walletError || !wallet || wallet.status !== 'active') {
    console.error('[guest-qr-payment] Receiver wallet unavailable:', receiverWalletId)
    await refundGuestQrPayment(stripe, paymentIntent, 'receiver_wallet_unavailable')
    return { credited: false, reason: 'receiver_wallet_unavailable' }
  }

  const completedAt = new Date().toISOString()
  const currency = wallet.currency ?? qr.currency ?? paymentIntent.currency.toUpperCase()
  const description = qr.description ? `Card payment: ${qr.description}` : 'Guest card QR payment'
  const referenceId = `CARDQR-${paymentIntent.id}`

  let { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert(
      transactionInsertPayload({
        receiverWalletId,
        amount,
        currency,
        paymentIntentId: paymentIntent.id,
        referenceId,
        description,
        qrCodeId,
        completedAt,
        payerDetails,
        includePayerDetails,
      }),
    )
    .select('id, reference_id')
    .single()

  if (transactionError && includePayerDetails && isMissingGuestPayerColumn(transactionError)) {
    includePayerDetails = false
    const fallback = await supabase
      .from('transactions')
      .insert(
        transactionInsertPayload({
          receiverWalletId,
          amount,
          currency,
          paymentIntentId: paymentIntent.id,
          referenceId,
          description,
          qrCodeId,
          completedAt,
          payerDetails,
          includePayerDetails,
        }),
      )
      .select('id, reference_id')
      .single()
    transaction = fallback.data
    transactionError = fallback.error
  }

  if (transactionError || !transaction) {
    if (transactionError?.code === '23505') {
      const { data: alreadyCredited }: { data: any } = await supabase
        .from('transactions')
        .select(guestPayerSelectColumns(includePayerDetails))
        .eq('stripe_payment_intent_id', paymentIntent.id)
        .maybeSingle()

      if (alreadyCredited?.id) {
        const alreadyPayerName = 'guest_payer_name' in alreadyCredited ? alreadyCredited.guest_payer_name : null
        const alreadyPayerEmail = 'guest_payer_email' in alreadyCredited ? alreadyCredited.guest_payer_email : null

        if (includePayerDetails && (payerDetails.name || payerDetails.email) && (!alreadyPayerName || !alreadyPayerEmail)) {
          await supabase
            .from('transactions')
            .update({
              guest_payer_name: alreadyPayerName ?? payerDetails.name ?? null,
              guest_payer_email: alreadyPayerEmail ?? payerDetails.email ?? null,
            })
            .eq('id', alreadyCredited.id)
        }

        await ensureGuestQrReceiverNotification(supabase, {
          transactionId: alreadyCredited.id,
          receiverUserId,
          amount: Number(alreadyCredited.amount ?? amount),
          currency: alreadyCredited.currency ?? currency,
          payerName: alreadyPayerName ?? payerDetails.name,
        })
      }

      return {
        credited: false,
        already_credited: true,
        reference_id: alreadyCredited?.reference_id ?? referenceId,
      }
    }

    console.error('[guest-qr-payment] Failed to record transaction:', transactionError)
    throw transactionError ?? new Error('Failed to record guest QR card payment')
  }

  const { error: walletUpdateError } = await supabase
    .from('wallets')
    .update({
      balance: parseFloat(wallet.balance) + amount,
      updated_at: completedAt,
    })
    .eq('id', receiverWalletId)

  if (walletUpdateError) {
    await supabase.from('transactions').delete().eq('id', transaction.id)
    console.error('[guest-qr-payment] Failed to credit receiver wallet:', walletUpdateError)
    throw walletUpdateError
  }

  await supabase
    .from('qr_codes')
    .update({
      paid_count: Number(qr.paid_count ?? 0) + 1,
      is_active: qr.single_use ? false : qr.is_active,
      updated_at: completedAt,
    })
    .eq('id', qrCodeId)

  await ensureGuestQrReceiverNotification(supabase, {
    transactionId: transaction.id,
    receiverUserId,
    amount,
    currency,
    payerName: payerDetails.name,
  })

  await notifyAdmins(supabase, {
    type: 'transaction',
    category: 'payment',
    title: 'Guest QR card payment completed',
    message: `Guest paid ${amount.toFixed(2)} ${currency} via QR code.`,
    link_url: '/admin',
    reference_id: transaction.id,
  })

  await supabase.from('audit_logs').insert({
    user_id: receiverUserId,
    action: 'guest_qr_card_payment_received',
    resource_type: 'transaction',
    resource_id: transaction.id,
    status: 'success',
    details: {
      amount,
      qr_code_id: qrCodeId,
      stripe_payment_intent_id: paymentIntent.id,
      reference_id: transaction.reference_id,
      payer_name: payerDetails.name ?? null,
      payer_email: payerDetails.email ?? null,
    },
  })

  return {
    credited: true,
    amount,
    currency,
    reference_id: transaction.reference_id,
    transaction_id: transaction.id,
    receiver_wallet_id: receiverWalletId,
    description,
    payer_name: payerDetails.name ?? null,
    payer_email: payerDetails.email ?? null,
  }
}
