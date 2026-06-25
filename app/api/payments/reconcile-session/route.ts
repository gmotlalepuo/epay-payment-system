import { createClient } from '@/lib/supabase/server'
import { requireActiveAccount } from '@/lib/api-guards'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification, notifyAdmins } from '@/lib/notifications'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

/**
 * POST /api/payments/reconcile-session
 *
 * Body: { session_id: string }
 *
 * Verifies a Stripe Checkout Session and credits the wallet if the payment
 * succeeded and we haven't credited it already. Idempotent: dedupes on
 * stripe_payment_intent_id so the webhook path can run alongside this one
 * without double-crediting.
 *
 * Used by the topup success page as a belt-and-braces credit when the webhook
 * can't reach localhost in dev.
 */
export async function POST(request: NextRequest) {
  try {
    const { auth, response } = await requireActiveAccount(request)
    if (response) return response
    const { user } = auth

    const { session_id } = await request.json()
    if (!session_id || typeof session_id !== 'string') {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }

    // Source of truth: Stripe itself
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['payment_intent'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json({
        credited: false,
        reason: `payment_status is "${session.payment_status}"`,
      })
    }

    const pi = session.payment_intent as Stripe.PaymentIntent | null
    if (!pi || typeof pi === 'string') {
      return NextResponse.json({ error: 'Session has no expanded payment_intent' }, { status: 400 })
    }

    const userId = pi.metadata?.user_id
    const walletId = pi.metadata?.wallet_id
    const amount = pi.amount / 100

    if (!userId || !walletId) {
      return NextResponse.json(
        { error: 'Payment intent missing user_id / wallet_id metadata' },
        { status: 400 },
      )
    }

    // Only the user that owns the session can trigger reconciliation
    if (userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = await createClient()

    // Idempotency: if a row already exists for this payment intent, do nothing
    const { data: existing } = await supabase
      .from('transactions')
      .select('id, reference_id')
      .eq('stripe_payment_intent_id', pi.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        credited: false,
        already_credited: true,
        reference_id: existing.reference_id,
      })
    }

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('balance, currency')
      .eq('id', walletId)
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    await supabase
      .from('wallets')
      .update({
        balance: parseFloat(wallet.balance) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', walletId)

    const referenceId = `TOPUP-${pi.id}`

    await supabase.from('transactions').insert({
      from_wallet_id: null,
      to_wallet_id: walletId,
      type: 'topup',
      amount,
      currency: wallet.currency ?? 'BWP',
      status: 'completed',
      stripe_payment_intent_id: pi.id,
      reference_id: referenceId,
      description: 'Wallet top-up via Stripe',
      completed_at: new Date().toISOString(),
    })

    await createNotification(supabase, {
      user_id: userId,
      type: 'transaction',
      category: 'payment',
      title: 'Top-up successful',
      message: `P${amount.toFixed(2)} has been added to your wallet`,
      link_url: `/dashboard/wallets/${walletId}`,
    })

    await notifyAdmins(supabase, {
      type: 'transaction',
      category: 'payment',
      title: 'Wallet top-up reconciled',
      message: `User ${userId} reconciled a P${amount.toFixed(2)} top-up.`,
      link_url: '/admin',
    })

    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'wallet_topup_reconciled',
      resource_type: 'transaction',
      resource_id: pi.id,
      status: 'success',
      details: { amount, stripe_intent_id: pi.id, via: 'success_page' },
    })

    return NextResponse.json({
      credited: true,
      amount,
      reference_id: referenceId,
      wallet_id: walletId,
    })
  } catch (error: any) {
    console.error('[stripe] Reconcile error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Reconcile failed' },
      { status: 500 },
    )
  }
}
