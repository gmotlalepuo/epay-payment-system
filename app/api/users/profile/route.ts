import { getAuthenticatedContext } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    // Read with maybeSingle so a missing row isn't an error
    const { data: existing, error: readErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (readErr) {
      console.error('[profile] read error:', readErr)
      return NextResponse.json({ error: readErr.message }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json({ profile: existing })
    }

    // Backfill: the on_auth_user_created trigger should have done this, but
    // older auth.users rows (predating the trigger) may not have a profile.
    // Insert a minimal one and return it so the page can render.
    const metadata = (user.user_metadata ?? {}) as Record<string, string>
    const { data: inserted, error: insertErr } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email ?? '',
        phone_number: metadata.phone ?? `+placeholder_${user.id}`,
        first_name: metadata.first_name ?? 'User',
        last_name: metadata.last_name ?? '',
        role: 'customer',
        status: 'active',
        password_hash: '',
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[profile] backfill insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ profile: inserted })
  } catch (error: any) {
    console.error('[profile] GET error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Internal server error' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthenticatedContext(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { supabase, user } = auth

    const { first_name, last_name, phone_number } = await request.json()

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (typeof first_name === 'string') patch.first_name = first_name.trim()
    if (typeof last_name === 'string') patch.last_name = last_name.trim()
    if (typeof phone_number === 'string') patch.phone_number = phone_number.trim()

    const { data: profile, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[profile] PUT error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('[profile] PUT outer error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Internal server error' },
      { status: 500 },
    )
  }
}
