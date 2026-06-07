import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/qr-codes/resolve/[token] — public resolver for the scan landing page.
// Calls the qr_codes_resolve(p_token) SECURITY DEFINER function so unauthenticated
// users can fetch enough info to render the payment confirmation screen.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('qr_codes_resolve', { p_token: token })

    if (error) {
      if (error.code === 'PGRST202') {
        console.error(
          'QR resolver function is missing. Run lib/db/migrations/002-public-qr-resolver.sql in Supabase.',
        )
        return NextResponse.json(
          {
            error:
              'QR payment resolver is not installed. Run the latest database migration and try again.',
          },
          { status: 500 },
        )
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
    }

    // Compute payable status server-side so the page can short-circuit
    const now = new Date()
    const expired = row.expiry_at && new Date(row.expiry_at) <= now
    const exhausted = row.single_use && row.paid_count > 0
    const payable = row.is_active && !expired && !exhausted

    return NextResponse.json({
      qr: {
        id: row.id,
        wallet_id: row.wallet_id,
        description: row.description,
        amount: Number(row.amount),
        currency: row.currency,
        single_use: row.single_use,
        is_active: row.is_active,
        paid_count: row.paid_count,
        expiry_at: row.expiry_at,
        receiver_name: [row.receiver_first_name, row.receiver_last_name]
          .filter(Boolean)
          .join(' ')
          .trim(),
        receiver_user_id: row.receiver_user_id,
      },
      payable,
      reason: payable
        ? null
        : exhausted
          ? 'This single-use QR has already been paid'
          : expired
            ? 'This QR code has expired'
            : 'This QR code is no longer active',
    })
  } catch (error) {
    console.error('Error resolving QR token:', error)
    return NextResponse.json({ error: 'Failed to resolve QR code' }, { status: 500 })
  }
}
