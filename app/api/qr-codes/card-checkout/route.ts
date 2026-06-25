import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/notifications'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
const APPROX_MIN_CARD_AMOUNT_BY_CURRENCY: Record<string, number> = {
  usd: 0.5,
  bwp: 8,
  zar: 10,
  eur: 0.5,
  gbp: 0.3,
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
    }

    const supabase = createServiceRoleClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Service role key is not configured' }, { status: 500 })
    }

    const body = await request.json()
    const qrCodeId: string | undefined = body.qr_code_id ?? body.qrCodeId
    const successUrl = typeof body.success_url === 'string' ? body.success_url : null
    const cancelUrl = typeof body.cancel_url === 'string' ? body.cancel_url : null

    if (!qrCodeId) {
      return NextResponse.json({ error: 'qr_code_id is required' }, { status: 400 })
    }

    const { data: qr, error } = await supabase
      .from('qr_codes')
      .select('id, token, wallet_id, amount, currency, description, is_active, single_use, paid_count, expiry_at')
      .eq('id', qrCodeId)
      .single()

    if (error || !qr) {
      return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
    }

    const expired = qr.expiry_at && new Date(qr.expiry_at) <= new Date()
    const exhausted = qr.single_use && qr.paid_count > 0
    if (!qr.is_active || expired || exhausted) {
      return NextResponse.json({ error: 'QR code is not payable' }, { status: 400 })
    }

    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, user_id, currency, status')
      .eq('id', qr.wallet_id)
      .single()

    if (walletError || !wallet || wallet.status !== 'active') {
      return NextResponse.json({ error: 'Receiver wallet is not active' }, { status: 400 })
    }

    const amount = Number(qr.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid QR amount' }, { status: 400 })
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin
    const currency = String(qr.currency || wallet.currency || 'bwp').toLowerCase()
    const minimumAmount = APPROX_MIN_CARD_AMOUNT_BY_CURRENCY[currency] ?? 1

    if (amount < minimumAmount) {
      return NextResponse.json(
        {
          error: `Card payments must be at least ${minimumAmount.toFixed(2)} ${currency.toUpperCase()}. Use wallet payment for smaller amounts.`,
        },
        { status: 400 },
      )
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: qr.description || 'QR payment',
              description: `Payment to wallet ${wallet.id.slice(0, 8)}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          source: 'guest_qr_payment',
          qr_code_id: qr.id,
          qr_token: qr.token,
          receiver_wallet_id: wallet.id,
          receiver_user_id: wallet.user_id,
          description: qr.description ?? '',
        },
      },
      metadata: {
        source: 'guest_qr_payment',
        qr_code_id: qr.id,
        qr_token: qr.token,
      },
      success_url: successUrl ?? `${origin}/pay/${qr.token}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${origin}/pay/${qr.token}?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[guest-qr-checkout] Failed to create checkout session:', error)
    const message =
      error?.type === 'StripeInvalidRequestError'
        ? `Stripe checkout error: ${error.message}`
        : error?.message ?? 'Failed to create card checkout'

    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
