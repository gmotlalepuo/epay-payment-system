import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

export type NotificationPayload = {
  user_id: string
  type: 'transaction' | 'security' | 'wallet' | 'complaint' | 'system'
  title: string
  message: string
  category?: 'payment' | 'security' | 'wallet' | 'complaint' | 'merchant' | 'system'
  link_url?: string | null
  reference_id?: string | null
}

function categoryForType(type: NotificationPayload['type']): NotificationPayload['category'] {
  switch (type) {
    case 'transaction':
      return 'payment'
    case 'wallet':
      return 'wallet'
    case 'security':
      return 'security'
    case 'complaint':
      return 'complaint'
    default:
      return 'system'
  }
}

export function createServiceRoleClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

export async function createNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload,
) {
  const client = createServiceRoleClient() ?? supabase

  const { error } = await client.from('notifications').insert({
    user_id: payload.user_id,
    title: payload.title,
    message: payload.message,
    category: payload.category ?? categoryForType(payload.type),
    type: payload.type,
    link_url: payload.link_url ?? null,
    reference_id: payload.reference_id ?? null,
  })
  if (error) {
    console.error('[notifications] insert error:', error.message || error, payload)
  }
  return error
}

export async function notifyAdmins(
  supabase: SupabaseClient,
  payload: Omit<NotificationPayload, 'user_id'>,
) {
  const serviceClient = createServiceRoleClient()
  if (!serviceClient) {
    console.error('[notifications] SUPABASE_SERVICE_ROLE_KEY is not configured')
    return
  }

  const { data: admins, error } = await serviceClient
    .from('users')
    .select('id')
    .eq('role', 'super_admin')

  if (error) {
    console.error('[notifications] failed to fetch admin users:', error.message || error)
    return
  }

  if (!admins?.length) {
    return
  }

  await Promise.all(
    admins.map((admin) =>
      createNotification(serviceClient, {
        ...payload,
        user_id: admin.id,
      }),
    ),
  )
}
