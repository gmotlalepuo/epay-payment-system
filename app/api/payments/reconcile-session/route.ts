import { createClient } from '@/lib/supabase/server'
import { requireActiveAccount } from '@/lib/api-guards'
import { NextRequest, NextResponse } from 'next/server'
import { createNotification, createServiceRoleClient, notifyAdmins } from '@/lib/notifications'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

type TopUpCreditResult = {
  credited: boolean
  already_credited: boolean
  transaction_id: string
  reference_id: string
  wallet_id: string
  amount: number
}

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

    const supabase = createServiceRoleClient() ?? (await createClient())

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
      .select('id, user_id, currency, status')
      .eq('id', walletId)
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    if (wallet.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (wallet.status !== 'active') {
      return NextResponse.json({ error: 'Wallet is not active' }, { status: 409 })
    }

    const { data: creditRows, error: creditError } = await supabase.rpc('fn_credit_stripe_topup', {
      p_user_id: userId,
      p_wallet_id: walletId,
      p_payment_intent_id: pi.id,
      p_amount: amount,
      p_currency: wallet.currency ?? pi.currency?.toUpperCase() ?? 'BWP',
      p_description: 'Wallet top-up via Stripe',
    })

    const credit = (Array.isArray(creditRows) ? creditRows[0] : creditRows) as TopUpCreditResult | undefined

    if (creditError || !credit) {
      console.error('[stripe] Reconcile credit failed:', creditError)
      return NextResponse.json({ error: 'Could not credit the wallet' }, { status: 500 })
    }

    await createNotification(supabase, {
      user_id: userId,
      type: 'transaction',
      category: 'payment',
      title: 'Top-up successful',
      message: `P${amount.toFixed(2)} has been added to your wallet`,
      link_url: `/dashboard/wallets/${walletId}`,
      reference_id: credit.transaction_id,
    })

    if (credit.already_credited) {
      return NextResponse.json({
        credited: false,
        already_credited: true,
        amount,
        reference_id: credit.reference_id,
        wallet_id: walletId,
      })
    }

    await notifyAdmins(supabase, {
      type: 'transaction',
      category: 'payment',
      title: 'Wallet top-up reconciled',
      message: `User ${userId} reconciled a P${amount.toFixed(2)} top-up.`,
      link_url: '/admin',
    })

    const { error: auditError } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'wallet_topup_reconciled',
      resource_type: 'transaction',
      resource_id: pi.id,
      status: 'success',
      details: { amount, stripe_intent_id: pi.id, via: 'success_page' },
    })
    if (auditError) {
      console.error('[stripe] Reconcile audit log insert failed:', auditError)
    }

    return NextResponse.json({
      credited: credit.credited,
      already_credited: credit.already_credited,
      amount,
      reference_id: credit.reference_id,
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
