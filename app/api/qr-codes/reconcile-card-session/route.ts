import { applyGuestQrCardPayment } from '@/lib/guest-qr-card-payments'
import { createServiceRoleClient } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

/**
 * POST /api/qr-codes/reconcile-card-session
 *
 * Body: { session_id: string }
 *
 * Verifies a guest QR Stripe Checkout Session and applies the wallet credit if
 * the webhook has not already done it. This is useful in dev/local setups where
 * Stripe webhooks cannot reach the app without a tunnel.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const supabase = createServiceRoleClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Service role key is not configured' }, { status: 500 })
    }

    const { session_id } = await request.json()
    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json({
        credited: false,
        reason: `payment_status is "${session.payment_status}"`,
      })
    }

    if (session.metadata?.source !== 'guest_qr_payment') {
      return NextResponse.json({ error: 'Session is not a guest QR payment' }, { status: 400 })
    }

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null
    if (!paymentIntent || typeof paymentIntent === 'string') {
      return NextResponse.json({ error: 'Session has no expanded payment_intent' }, { status: 400 })
    }

    if (paymentIntent.metadata?.source !== 'guest_qr_payment') {
      return NextResponse.json({ error: 'Payment intent is not a guest QR payment' }, { status: 400 })
    }

    const result = await applyGuestQrCardPayment(paymentIntent, supabase, stripe)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[guest-qr-reconcile] Reconcile error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Guest QR card reconcile failed' },
      { status: 500 },
    )
  }
}
