import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getUserRole() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error fetching user role:', error)
    return null
  }

  return data?.role || 'customer'
}

export async function isAdmin() {
  const role = await getUserRole()
  return role === 'super_admin'
}

export function requireAuth(requiredRole?: string) {
  return async (request: Request) => {
    const user = await getCurrentUser()
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (requiredRole) {
      const role = await getUserRole()
      if (role !== requiredRole && role !== 'super_admin') {
        return new Response('Forbidden', { status: 403 })
      }
    }

    return null
  }
}
