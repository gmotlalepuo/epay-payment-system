import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { randomBytes } from 'crypto'

// 10-char base32-ish slug — short enough for a clean QR, long enough to avoid collision
function generateToken(): string {
  return randomBytes(8).toString('base64url').slice(0, 10).toUpperCase()
}

// POST /api/qr-codes — create a payment QR for a wallet the caller owns
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const body = await request.json()
    const description = (body.description ?? '').toString().trim()
    const amount = Number(body.amount)
    const walletId: string | undefined = body.wallet_id
    const singleUse = Boolean(body.single_use)
    const expiryAt: string | null = body.expiry_at ?? null

    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
    }

    // Resolve wallet: explicit wallet_id, or default to user's first active wallet
    let wallet
    if (walletId) {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, user_id, status, currency')
        .eq('id', walletId)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
      }
      wallet = data
    } else {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, user_id, status, currency')
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

    const token = generateToken()
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ??
      request.nextUrl.origin
    const payUrl = `${origin}/pay/${token}`

    const qrImage = await QRCode.toDataURL(payUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 320,
      margin: 1,
    })

    const { data: qrCode, error: insertError } = await supabase
      .from('qr_codes')
      .insert({
        wallet_id: wallet.id,
        token,
        description,
        amount,
        currency: wallet.currency ?? 'USD',
        qr_image_url: qrImage,
        single_use: singleUse,
        expiry_at: expiryAt,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'qr_code_created',
      resource_type: 'qr_code',
      resource_id: qrCode.id,
      details: { token, amount, description, single_use: singleUse },
      status: 'success',
    })

    return NextResponse.json({ qrCode, payUrl }, { status: 201 })
  } catch (error) {
    console.error('Error creating QR code:', error)
    return NextResponse.json({ error: 'Failed to create QR code' }, { status: 500 })
  }
}

// GET /api/qr-codes — list QR codes for caller's wallets
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { data: wallets } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)

    const walletIds = (wallets ?? []).map((w) => w.id)
    if (walletIds.length === 0) {
      return NextResponse.json({ qrCodes: [] })
    }

    const { data: qrCodes, error } = await supabase
      .from('qr_codes')
      .select('*')
      .in('wallet_id', walletIds)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ qrCodes })
  } catch (error) {
    console.error('Error listing QR codes:', error)
    return NextResponse.json({ error: 'Failed to list QR codes' }, { status: 500 })
  }
}
