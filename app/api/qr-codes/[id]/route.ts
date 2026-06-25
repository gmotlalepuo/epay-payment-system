import { requireActiveAccount } from '@/lib/api-guards'
import { createNotification } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/qr-codes/[id] — update is_active (deactivate / reactivate)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { auth, response } = await requireActiveAccount(request)
    if (response) return response
    const { supabase, user } = auth

    const { id } = await params
    const body = await request.json()
    const isActive = Boolean(body.is_active)

    // RLS already restricts updates to wallets the user owns
    const { data: existing } = await supabase
      .from('qr_codes')
      .select('id, description, is_active')
      .eq('id', id)
      .maybeSingle()

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

    if (existing && existing.is_active !== isActive) {
      await createNotification(supabase, {
        user_id: user.id,
        type: 'wallet',
        category: 'wallet',
        title: isActive ? 'QR request activated' : 'QR request deactivated',
        message: `${existing.description ?? 'Your QR request'} is now ${isActive ? 'active' : 'inactive'}.`,
        link_url: '/dashboard/qr-codes',
        reference_id: id,
      })
    }

    return NextResponse.json({ qrCode: data })
  } catch (error) {
    console.error('Error updating QR code:', error)
    return NextResponse.json({ error: 'Failed to update QR code' }, { status: 500 })
  }
}
