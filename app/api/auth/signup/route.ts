import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, phoneNumber } = await request.json()

    if (!email || !password || !firstName || !lastName || !phoneNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
          `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
        data: {
          first_name: firstName,
          last_name: lastName,
          phone: phoneNumber,
        },
      },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }
    if (!authData.user) {
      return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
    }

    // public.users row is created automatically by the on_auth_user_created
    // trigger, but its phone_number defaults to a placeholder. Update it now
    // with the real one the user typed in. Email isn't unique elsewhere yet,
    // so this is the simplest backfill that doesn't race with the trigger.
    await supabase
      .from('users')
      .update({ phone_number: phoneNumber })
      .eq('id', authData.user.id)

    return NextResponse.json({
      message: 'Signup successful. Please check your email to confirm your account.',
      user: { id: authData.user.id, email: authData.user.email },
    })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json({ error: 'An error occurred during signup' }, { status: 500 })
  }
}
