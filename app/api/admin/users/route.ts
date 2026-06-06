import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getUserRole } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/users - list users (paginated)
export async function GET(request: NextRequest) {
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = await getUserRole()
  if (role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()

  const url = request.nextUrl
  const page = Math.max(0, Number(url.searchParams.get('page') ?? 0))
  const per = Math.min(100, Math.max(10, Number(url.searchParams.get('per') ?? 25)))

  const { data, error, count } = await supabase
    .from('users')
    .select('*', { count: 'estimated' })
    .order('created_at', { ascending: false })
    .range(page * per, page * per + per - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: data ?? [], count: count ?? 0 })
}
