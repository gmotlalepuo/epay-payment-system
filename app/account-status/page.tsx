'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, Loader2, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { accountStatusMessage } from '@/lib/account-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BrandLogo } from '@/components/brand-logo'

type Profile = {
  email: string
  status: string
}

export default function AccountStatusPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let alive = true

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.assign('/auth/login')
        return
      }

      const { data } = await supabase
        .from('users')
        .select('email, status')
        .eq('id', user.id)
        .maybeSingle()

      if (!alive) return
      setProfile(data ?? { email: user.email ?? 'Account', status: 'active' })
      setLoading(false)
    }

    void load()
    return () => {
      alive = false
    }
  }, [supabase])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.assign('/auth/login')
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <BrandLogo priority className="h-12 w-40" />
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
              <ShieldAlert className="size-6" />
            </div>
            <CardTitle>Account access limited</CardTitle>
            <CardDescription>
              {loading ? 'Checking your account status...' : profile?.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading account status...
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold capitalize">Status: {profile?.status}</p>
                  <p className="mt-1">
                    {accountStatusMessage(profile?.status) ??
                      'Your account is active. You can return to the dashboard.'}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button asChild variant="outline">
                    <Link href="/auth/forgot">Recover account</Link>
                  </Button>
                  <Button type="button" variant="destructive" onClick={signOut}>
                    <LogOut className="mr-2 size-4" /> Sign out
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
