import { createClient } from '@/lib/supabase/server'
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'

export type AuthContext = {
  supabase: SupabaseClient
  user: User
}

function getBearerToken(request?: Request) {
  const authorization = request?.headers.get('authorization')
  if (!authorization) return null

  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null

  return token.trim()
}

function createJwtScopedClient(token: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  )
}

export async function getAuthenticatedContext(request?: Request): Promise<AuthContext | null> {
  const bearerToken = getBearerToken(request)

  if (bearerToken) {
    const verifier = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const {
      data: { user },
      error,
    } = await verifier.auth.getUser(bearerToken)

    if (error || !user) return null

    return {
      supabase: createJwtScopedClient(bearerToken),
      user,
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return { supabase, user }
}

export async function getCurrentUser(request?: Request) {
  const auth = await getAuthenticatedContext(request)
  return auth?.user ?? null
}

export async function getUserRole(request?: Request) {
  const auth = await getAuthenticatedContext(request)
  if (!auth) return null

  const { supabase, user } = auth

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
    const user = await getCurrentUser(request)
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    if (requiredRole) {
      const role = await getUserRole(request)
      if (role !== requiredRole && role !== 'super_admin') {
        return new Response('Forbidden', { status: 403 })
      }
    }

    return null
  }
}
