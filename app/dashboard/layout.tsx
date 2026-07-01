'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DashboardShell } from '@/components/dashboard-shell'
import { LoaderCircle, ShieldAlert } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<{
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let alive = true
    async function loadProfile(userId: string) {
      const { data, error } = await supabase
        .from('users')
        .select('first_name, last_name, avatar_url')
        .eq('id', userId)
        .maybeSingle()

      if (!alive) return
      if (error) {
        console.error('[dashboard-layout] Error loading profile:', error)
        return
      }
      setProfile(data ?? null)
    }

    async function getUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!alive) return
        setUser(user)
        if (user) {
          await loadProfile(user.id)
        }
      } catch (error) {
        console.error('[v0] Error getting user:', error)
      } finally {
        if (alive) setLoading(false)
      }
    }

    getUser()
    function handleProfileUpdated() {
      if (user?.id) {
        void loadProfile(user.id)
      }
    }
    window.addEventListener('botsapay-profile-updated', handleProfileUpdated)
    return () => {
      alive = false
      window.removeEventListener('botsapay-profile-updated', handleProfileUpdated)
    }
  }, [supabase, user?.id])

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
    <DashboardShell
      email={user.email ?? 'Account'}
      userId={user.id}
      displayName={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
      avatarUrl={profile?.avatar_url}
      onLogout={handleLogout}
    >
      {children}
    </DashboardShell>
  )
}
