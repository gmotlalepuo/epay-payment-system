import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getUserRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const { data, error } = await supabase.from('users').select('*').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (typeof body.role === 'string') updates.role = body.role
  if (typeof body.status === 'string') updates.status = body.status

  const supabase = await createClient()
  const { data, error } = await supabase.from('users').update(updates).eq('id', params.id).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    action: 'admin_update_user',
    resource_type: 'user',
    resource_id: params.id,
    details: updates,
    status: 'success',
  })

  return NextResponse.json({ user: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()

  // Delete public.users row and rely on auth deletion/cascade if desired.
  const { error } = await supabase.from('users').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    action: 'admin_delete_user',
    resource_type: 'user',
    resource_id: params.id,
    status: 'success',
  })

  return NextResponse.json({ message: 'User deleted' })
}
