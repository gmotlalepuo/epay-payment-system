import { requireActiveAccount } from '@/lib/api-guards'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/wallets - Fetch user's wallets
export async function GET(request: NextRequest) {
  try {
    const { auth, response } = await requireActiveAccount(request)
    if (response) return response
    const { supabase, user } = auth

    // Ensure public.users row exists (backfill if the DB trigger isn't present)
    const { data: existingUser, error: readErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (readErr) {
      console.error('[wallets] profile read error:', readErr)
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    if (!existingUser) {
      const metadata = (user.user_metadata ?? {}) as Record<string, string>
      const { error: insertErr } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email ?? '',
          phone_number: metadata.phone ?? `+placeholder_${user.id}`,
          first_name: metadata.first_name ?? 'User',
          last_name: metadata.last_name ?? '',
          role: 'customer',
          status: 'active',
          password_hash: '',
        })
        .select()
        .single()

      if (insertErr) {
        console.error('[wallets] backfill insert error:', insertErr)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }
    }
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ wallets })
  } catch (error) {
    console.error('Error fetching wallets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch wallets' },
      { status: 500 }
    )
  }
}

// POST /api/wallets - Create a new wallet
export async function POST(request: NextRequest) {
  try {
    const { auth, response } = await requireActiveAccount(request)
    if (response) return response
    const { supabase, user } = auth

    const body = await request.json()
    const currency = 'BWP'
    const rawName = typeof body.name === 'string' ? body.name.trim() : ''
    const name = rawName.length > 0 ? rawName.slice(0, 60) : null

    // Generate unique wallet number
    const walletNumber = `W${crypto.randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase()}`

    const { data: wallet, error } = await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        wallet_number: walletNumber,
        name,
        currency,
        balance: 0,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'create_wallet',
      resource_type: 'wallet',
      resource_id: wallet.id,
      details: { wallet_number: walletNumber },
      status: 'success',
    })

    return NextResponse.json(
      { wallet, message: 'Wallet created successfully' },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating wallet:', error)
    return NextResponse.json(
      { error: 'Failed to create wallet' },
      { status: 500 }
    )
  }
}
