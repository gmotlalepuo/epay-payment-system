import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const body = await request.json()
    const { amount, currency = 'usd', description, metadata = {} } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }

    // Get user wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, balance, daily_limit, daily_spent')
      .eq('user_id', user.id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      )
    }

    // Check daily limit
    const amountInCents = Math.round(amount * 100)
    const dailySpentInCents = Math.round(wallet.daily_spent * 100)
    const dailyLimitInCents = Math.round(wallet.daily_limit * 100)

    if (dailySpentInCents + amountInCents > dailyLimitInCents) {
      return NextResponse.json(
        { error: 'Daily spending limit exceeded' },
        { status: 400 }
      )
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      description,
      metadata: {
        user_id: user.id,
        wallet_id: wallet.id,
        ...metadata,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: any) {
    console.error('[v0] Payment intent creation error:', error)
    return NextResponse.json(
      { error: error.message || 'Payment processing failed' },
      { status: 500 }
    )
  }
}
