import { requireActiveAccount } from '@/lib/api-guards'
import { NextRequest, NextResponse } from 'next/server'

function displayName(user: any) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.email || 'BotsPay user'
}

export async function GET(request: NextRequest) {
  const { auth, response } = await requireActiveAccount(request)
  if (response) return response

  const walletNumber = request.nextUrl.searchParams.get('wallet_number')?.trim()
  if (!walletNumber) {
    return NextResponse.json({ error: 'wallet_number is required' }, { status: 400 })
  }

  const { supabase, user } = auth
  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('id, wallet_number, name, currency, status, user_id')
    .eq('wallet_number', walletNumber)
    .single()

  if (error || !wallet) {
    return NextResponse.json({ error: 'Recipient wallet not found' }, { status: 404 })
  }

  if (wallet.user_id === user.id) {
    return NextResponse.json({ error: 'You cannot transfer to your own wallet.' }, { status: 400 })
  }

  const { data: owner } = await supabase
    .from('users')
    .select('first_name, last_name, email, status')
    .eq('id', wallet.user_id)
    .maybeSingle()

  return NextResponse.json({
    recipient: {
      wallet_number: wallet.wallet_number,
      wallet_name: wallet.name,
      currency: wallet.currency,
      wallet_status: wallet.status,
      owner_name: displayName(owner),
      owner_status: owner?.status ?? 'active',
      payable: wallet.status === 'active' && (owner?.status ?? 'active') === 'active',
    },
  })
}
