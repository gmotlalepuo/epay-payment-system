import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/wallets/[id] — wallet detail + its QR codes + its recent transactions
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedContext(_request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { id } = await params

    const { data: wallet, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', id)
      .single()

    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }
    if (wallet.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [{ data: qrCodes }, { data: transactions }] = await Promise.all([
      supabase
        .from('qr_codes')
        .select('*')
        .eq('wallet_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('*')
        .or(`from_wallet_id.eq.${id},to_wallet_id.eq.${id}`)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    return NextResponse.json({
      wallet,
      qrCodes: qrCodes ?? [],
      transactions: transactions ?? [],
    })
  } catch (error) {
    console.error('Error loading wallet detail:', error)
    return NextResponse.json({ error: 'Failed to load wallet' }, { status: 500 })
  }
}

// PATCH /api/wallets/[id] — rename only (status/limits are admin/scheduled jobs)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { id } = await params
    const body = await request.json()
    const raw = typeof body.name === 'string' ? body.name.trim() : ''
    const name = raw.length > 0 ? raw.slice(0, 60) : null

    // RLS already restricts updates to wallets the user owns
    const { data, error } = await supabase
      .from('wallets')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'wallet_renamed',
      resource_type: 'wallet',
      resource_id: id,
      details: { name },
      status: 'success',
    })

    return NextResponse.json({ wallet: data })
  } catch (error) {
    console.error('Error updating wallet:', error)
    return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 })
  }
}
