'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DashboardShell } from '@/components/dashboard-shell'
import { LoaderCircle, ShieldAlert } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('[v0] Error getting user:', error)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-background"><div className="text-center"><LoaderCircle className="mx-auto size-8 animate-spin text-primary" /><p className="mt-3 text-sm font-medium text-muted-foreground">Preparing your workspace...</p></div></div>
  }

  if (!user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6 text-center">
        <div><ShieldAlert className="mx-auto size-9 text-muted-foreground" /><p className="mt-3 font-medium">Please log in to access this page</p></div>
      </div>
    )
  }

  return (
    <DashboardShell email={user.email ?? 'Account'} onLogout={handleLogout}>{children}</DashboardShell>
  )
}
