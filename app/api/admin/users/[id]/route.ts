import { getAuthenticatedContext, getUserRole } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedContext(_request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(_request)
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { supabase } = auth
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedContext(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(request)
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { supabase, user: actor } = auth
  const { id } = await params
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (typeof body.role === 'string') updates.role = body.role
  if (typeof body.status === 'string') updates.status = body.status

  const { data: before } = await supabase
    .from('users')
    .select('status, role')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (typeof updates.status === 'string' && before?.status !== updates.status) {
    await createNotification(supabase, {
      user_id: id,
      type: 'security',
      category: 'security',
      title: 'Account status changed',
      message: `Your account status changed from ${before?.status ?? 'unknown'} to ${updates.status}.`,
      link_url: '/dashboard/settings',
    })
  }

  if (typeof updates.role === 'string' && before?.role !== updates.role) {
    await createNotification(supabase, {
      user_id: id,
      type: 'security',
      category: 'security',
      title: 'Account role changed',
      message: `Your account role changed from ${before?.role ?? 'unknown'} to ${updates.role}.`,
      link_url: '/dashboard/settings',
    })
  }

  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    action: 'admin_update_user',
    resource_type: 'user',
    resource_id: id,
    details: updates,
    status: 'success',
  })

  return NextResponse.json({ user: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedContext(_request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole(_request)
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { supabase, user: actor } = auth
  const { id } = await params

  // Delete public.users row and rely on auth deletion/cascade if desired.
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    action: 'admin_delete_user',
    resource_type: 'user',
    resource_id: id,
    status: 'success',
  })

  return NextResponse.json({ message: 'User deleted' })
}
