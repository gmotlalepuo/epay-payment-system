import { requireActiveAccount } from '@/lib/api-guards'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

/**
 * POST /api/payments/create-checkout
 *
 * Body: { amount: number, wallet_id?: string }
 *
 * Creates a Stripe Checkout Session for a wallet top-up. The session's
 * payment_intent_data.metadata carries user_id + wallet_id so the existing
 * /api/payments/webhook handler can credit the right wallet on success.
 *
 * Returns { url } — caller redirects the browser to that URL.
 */
export async function POST(request: NextRequest) {
  try {
    const { auth, response } = await requireActiveAccount(request)
    if (response) return response
    const { supabase, user } = auth

    const body = await request.json()
    const amount = Number(body.amount)
    const walletId: string | undefined = body.wallet_id
    const successUrl = typeof body.success_url === 'string' ? body.success_url : null
    const cancelUrl = typeof body.cancel_url === 'string' ? body.cancel_url : null

    if (!Number.isFinite(amount) || amount < 8) {
      return NextResponse.json(
        { error: 'Amount must be at least P8.00' },
        { status: 400 },
      )
    }

    // Resolve target wallet (caller-supplied or first active for the user)
    let wallet
    if (walletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, user_id, currency, status')
        .eq('id', walletId)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
      }
      wallet = data
    } else {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, user_id, currency, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'No active wallet found' }, { status: 404 })
      }
      wallet = data
    }
    if (wallet.user_id !== user.id) {
      return NextResponse.json({ error: 'Wallet does not belong to user' }, { status: 403 })
    }
    if (wallet.status !== 'active') {
      return NextResponse.json({ error: 'Wallet is not active' }, { status: 400 })
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'bwp',
            product_data: {
              name: 'Wallet top-up',
              description: `Top up wallet ${wallet.id.slice(0, 8)}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          wallet_id: wallet.id,
          source: 'wallet_topup',
        },
      },
      success_url: successUrl ?? `${origin}/dashboard/topup/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${origin}/dashboard/topup?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[stripe] Failed to create checkout session:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create checkout session' },
      { status: 500 },
    )
  }
}
