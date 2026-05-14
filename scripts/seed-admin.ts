import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function seedAdmin() {
  try {
    console.log('Creating admin user...')

    // Admin credentials
    const adminEmail = 'admin@digitalwallet.io'
    const adminPassword = 'AdminPassword123!'
    const adminFirstName = 'Admin'
    const adminLastName = 'User'
    const adminPhone = '+1234567890'

    // Check if admin already exists
    const { data: existingAdmin } = await supabase
      .from('users')
      .select('id')
      .eq('email', adminEmail)
      .single()

    if (existingAdmin) {
      console.log('Admin user already exists with email:', adminEmail)
      return
    }

    // Create admin user in auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return
    }

    if (!authData.user) {
      console.error('Auth user creation returned no user')
      return
    }

    // Create admin profile
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: adminEmail,
        phone_number: adminPhone,
        first_name: adminFirstName,
        last_name: adminLastName,
        role: 'super_admin',
        email_verified: true,
        phone_verified: true,
        password_hash: '', // Managed by Supabase
        status: 'active',
      })

    if (profileError) {
      console.error('Error creating user profile:', profileError)
      // Clean up auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      return
    }

    console.log('\n✅ Admin user created successfully!\n')
    console.log('Admin Credentials:')
    console.log('==================')
    console.log(`Email: ${adminEmail}`)
    console.log(`Password: ${adminPassword}`)
    console.log(`Role: super_admin`)
    console.log('\nPlease change the password immediately after first login.')
  } catch (error) {
    console.error('Error seeding admin:', error)
    process.exit(1)
  }
}

seedAdmin()
