import { getAuthenticatedContext } from '@/lib/auth'
import { friendlyErrorResponse } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

const editableProfileFields = [
  'first_name',
  'last_name',
  'phone_number',
  'date_of_birth',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
] as const

function cleanOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null
}

function isValidDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
}

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
      return friendlyErrorResponse(readErr)
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
      return friendlyErrorResponse(insertErr)
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

    const body = await request.json()

    const protectedFields = ['id', 'email', 'role', 'status', 'password_hash']
    if (protectedFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
      return NextResponse.json(
        {
          error: 'Protected profile fields cannot be updated from this endpoint.',
          userMessage: 'Some profile fields cannot be changed here.',
        },
        { status: 400 },
      )
    }

    const firstName = cleanOptionalString(body.first_name, 80)
    const lastName = cleanOptionalString(body.last_name, 80)
    const phoneNumber = cleanOptionalString(body.phone_number, 40)

    if (!firstName || !lastName || !phoneNumber) {
      return NextResponse.json(
        {
          error: 'First name, last name, and phone number are required.',
          userMessage: 'Please enter your first name, last name, and phone number.',
          fields: {
            first_name: !firstName ? 'First name is required.' : undefined,
            last_name: !lastName ? 'Last name is required.' : undefined,
            phone_number: !phoneNumber ? 'Phone number is required.' : undefined,
          },
        },
        { status: 422 },
      )
    }

    const dateOfBirth = cleanOptionalString(body.date_of_birth, 10)
    if (dateOfBirth && !isValidDateOnly(dateOfBirth)) {
      return NextResponse.json(
        {
          error: 'Date of birth must be YYYY-MM-DD.',
          userMessage: 'Please enter date of birth in YYYY-MM-DD format.',
          fields: { date_of_birth: 'Use YYYY-MM-DD format.' },
        },
        { status: 422 },
      )
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      date_of_birth: dateOfBirth,
      address_line1: cleanOptionalString(body.address_line1, 160),
      address_line2: cleanOptionalString(body.address_line2, 160),
      city: cleanOptionalString(body.city, 80),
      state: cleanOptionalString(body.state, 80),
      postal_code: cleanOptionalString(body.postal_code, 32),
      country: cleanOptionalString(body.country, 80),
    }

    for (const field of editableProfileFields) {
      if (!Object.prototype.hasOwnProperty.call(body, field) && field !== 'first_name' && field !== 'last_name' && field !== 'phone_number') {
        delete patch[field]
      }
    }

    const { data: profile, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[profile] PUT error:', error)
      return friendlyErrorResponse(error, 400)
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
