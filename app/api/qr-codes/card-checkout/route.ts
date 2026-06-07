import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/notifications'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

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
    const currency = String(qr.currency ?? wallet.currency ?? 'usd').toLowerCase()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
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
      success_url: `${origin}/pay/${qr.token}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pay/${qr.token}?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[guest-qr-checkout] Failed to create checkout session:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create card checkout' },
      { status: 500 },
    )
  }
}
