import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationPayload = {
  user_id: string
  type: 'transaction' | 'security' | 'wallet' | 'complaint' | 'system'
  title: string
  message: string
  link_url?: string | null
  reference_id?: string | null
}

export async function createNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload,
) {
  const { error } = await supabase.from('notifications').insert(payload)
  if (error) {
    console.error('[notifications] insert error:', error.message || error, payload)
  }
  return error
}
