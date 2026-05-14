import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/qr-codes/[id] — update is_active (deactivate / reactivate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const isActive = Boolean(body.is_active)

    const supabase = await createClient()

    // RLS already restricts updates to wallets the user owns
    const { data, error } = await supabase
      .from('qr_codes')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
    }

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: isActive ? 'qr_code_activated' : 'qr_code_deactivated',
      resource_type: 'qr_code',
      resource_id: id,
      status: 'success',
    })

    return NextResponse.json({ qrCode: data })
  } catch (error) {
    console.error('Error updating QR code:', error)
    return NextResponse.json({ error: 'Failed to update QR code' }, { status: 500 })
  }
}
