import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_NOTIFICATION_PREFERENCES = {
  payment_notifications: true,
  security_notifications: true,
  wallet_notifications: true,
  complaint_notifications: true,
  merchant_notifications: false,
  email_notifications: true,
  sms_notifications: false,
  in_app_notifications: true,
}

const DEFAULT_PAYMENT_SECURITY = {
  confirm_transfers: true,
  confirm_qr_payments: true,
  confirm_topups: true,
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, user } = auth
    const [{ data: profile }, { data: notifications }, { data: paymentSecurity }] =
      await Promise.all([
        supabase
          .from('users')
          .select('email, status, two_factor_enabled, failed_login_attempts, last_login_at, updated_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('payment_security_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

    return NextResponse.json({
      session: {
        email: user.email,
        expires_at: user.app_metadata?.exp ?? null,
      },
      profile,
      notification_preferences: notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
      payment_security_preferences: paymentSecurity ?? DEFAULT_PAYMENT_SECURITY,
      linked_sessions_supported: false,
      login_activity_supported: Boolean(profile?.last_login_at),
    })
  } catch (error: any) {
    console.error('[security-settings] GET error:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to load security settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { supabase, user } = auth
    const body = await request.json()
    const notificationPatch = pickBooleans(body.notification_preferences, DEFAULT_NOTIFICATION_PREFERENCES)
    const paymentPatch = pickBooleans(body.payment_security_preferences, DEFAULT_PAYMENT_SECURITY)

    const [{ data: notificationPreferences, error: notificationError }, { data: paymentSecurity, error: paymentError }] =
      await Promise.all([
        supabase
          .from('notification_preferences')
          .upsert(
            {
              user_id: user.id,
              ...DEFAULT_NOTIFICATION_PREFERENCES,
              ...notificationPatch,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          .select()
          .single(),
        supabase
          .from('payment_security_preferences')
          .upsert(
            {
              user_id: user.id,
              ...DEFAULT_PAYMENT_SECURITY,
              ...paymentPatch,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          .select()
          .single(),
      ])

    if (notificationError || paymentError) {
      return NextResponse.json(
        { error: notificationError?.message ?? paymentError?.message ?? 'Failed to save settings' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      notification_preferences: notificationPreferences,
      payment_security_preferences: paymentSecurity,
    })
  } catch (error: any) {
    console.error('[security-settings] PUT error:', error)
    return NextResponse.json({ error: error?.message ?? 'Failed to save security settings' }, { status: 500 })
  }
}

function pickBooleans<T extends Record<string, boolean>>(value: unknown, defaults: T) {
  const result: Partial<T> = {}
  if (!value || typeof value !== 'object') return result

  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const candidate = (value as Record<string, unknown>)[String(key)]
    if (typeof candidate === 'boolean') result[key] = candidate as T[keyof T]
  }

  return result
}
