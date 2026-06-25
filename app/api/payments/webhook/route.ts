import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification, createServiceRoleClient, notifyAdmins } from '@/lib/notifications'
import { applyGuestQrCardPayment } from '@/lib/guest-qr-card-payments'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

async function getGuestQrPayerDetails(paymentIntentId: string) {
  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    })
    const session = sessions.data[0]
    return {
      name: session?.customer_details?.name ?? null,
      email: session?.customer_details?.email ?? null,
    }
  } catch (error) {
    console.error('[stripe-webhook] Failed to load guest QR checkout session:', error)
    return {}
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  supabase: any
) {
  const userId = paymentIntent.metadata.user_id
  const walletId = paymentIntent.metadata.wallet_id
  const amount = paymentIntent.amount / 100

  if (!userId || !walletId) {
    console.error('[stripe-webhook] Missing user_id or wallet_id in metadata:', paymentIntent.id)
    return
  }

  // Idempotency: bail if we've already credited for this payment_intent
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle()
  if (existing) return

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('balance, currency')
    .eq('id', walletId)
    .single()

  if (walletError || !wallet) {
    console.error('[stripe-webhook] Wallet not found for topup:', walletId)
    return
  }

  // Top-ups credit balance only — they do NOT consume daily spending limit.
  await supabase
    .from('wallets')
    .update({
      balance: parseFloat(wallet.balance) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', walletId)

  const referenceId = `TOPUP-${paymentIntent.id}`
  const { data: transaction } = await supabase.from('transactions').insert({
    from_wallet_id: null,
    to_wallet_id: walletId,
    type: 'topup',
    amount,
    currency: wallet.currency ?? 'BWP',
    status: 'completed',
    stripe_payment_intent_id: paymentIntent.id,
    reference_id: referenceId,
    description: 'Wallet top-up via Stripe',
    completed_at: new Date().toISOString(),
  })
    .select('id')
    .single()

  await createNotification(supabase, {
    user_id: userId,
    type: 'transaction',
    category: 'payment',
    title: 'Top-up successful',
    message: `P${amount.toFixed(2)} has been added to your wallet`,
    link_url: `/dashboard/wallets/${walletId}`,
    reference_id: transaction?.id ?? null,
  })

  await notifyAdmins(supabase, {
    type: 'transaction',
    category: 'payment',
    title: 'Wallet top-up completed',
    message: `User ${userId} topped up P${amount.toFixed(2)}.`,
    link_url: '/admin',
  })

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'wallet_topup',
    resource_type: 'transaction',
    resource_id: paymentIntent.id,
    status: 'success',
    details: { amount, stripe_intent_id: paymentIntent.id },
  })
}

async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  supabase: any
) {
  const userId = paymentIntent.metadata.user_id
  const amount = paymentIntent.amount / 100

  // Create failed transaction record
  // Failed top-ups: type='topup' would violate the (from OR to) check since
  // we have no wallet to credit. Skip the transactions row and just notify.
  await createNotification(supabase, {
    user_id: userId,
    type: 'transaction',
    category: 'payment',
    title: 'Top-up failed',
    message: `Your top-up of P${amount.toFixed(2)} could not be processed. Please try again.`,
    link_url: '/dashboard/topup',
  })

  // Log to audit
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'payment_failed',
    resource_type: 'transaction',
    resource_id: paymentIntent.id,
    status: 'failure',
    error_message: paymentIntent.last_payment_error?.message,
    details: { amount, stripe_intent_id: paymentIntent.id },
  })
}

async function handleGuestQrPaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
  supabase: any,
) {
  await notifyAdmins(supabase, {
    type: 'transaction',
    category: 'payment',
    title: 'Guest QR card payment failed',
    message: `A guest QR card payment for ${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()} failed.`,
    link_url: '/admin',
  })

  const receiverUserId = paymentIntent.metadata.receiver_user_id
  if (receiverUserId) {
    await supabase.from('audit_logs').insert({
      user_id: receiverUserId,
      action: 'guest_qr_card_payment_failed',
      resource_type: 'transaction',
      resource_id: paymentIntent.id,
      status: 'failure',
      error_message: paymentIntent.last_payment_error?.message,
      details: {
        qr_code_id: paymentIntent.metadata.qr_code_id ?? null,
        stripe_payment_intent_id: paymentIntent.id,
      },
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature || !webhookSecret) {
      return NextResponse.json(
        { error: 'Missing signature or webhook secret' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error('[v0] Webhook signature verification failed:', err.message)
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient() ?? (await createClient())

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        if (paymentIntent.metadata.source === 'guest_qr_payment') {
          await applyGuestQrCardPayment(
            paymentIntent,
            supabase,
            stripe,
            await getGuestQrPayerDetails(paymentIntent.id),
          )
        } else {
          await handlePaymentIntentSucceeded(paymentIntent, supabase)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        if (paymentIntent.metadata.source === 'guest_qr_payment') {
          await handleGuestQrPaymentFailed(paymentIntent, supabase)
        } else {
          await handlePaymentIntentFailed(paymentIntent, supabase)
        }
        break
      }

      default:
        console.log(`[v0] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[v0] Webhook processing error:', error)
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
