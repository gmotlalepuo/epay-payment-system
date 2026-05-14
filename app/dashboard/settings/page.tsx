'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface UserProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone_number: string | null
}

interface NotificationPreferences {
  transactions: boolean
  security: boolean
  promotions: boolean
  system: boolean
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notifications, setNotifications] = useState<NotificationPreferences>({
    transactions: true,
    security: true,
    promotions: false,
    system: true,
  })
  const supabase = createClient()

  useEffect(() => {
    void fetchUserProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchUserProfile() {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/users/profile')
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to fetch profile')
      }
      setProfile(data.profile)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load profile'
      console.error('Error fetching profile:', error)
      setLoadError(msg)
      toast.error('Could not load profile', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateProfile() {
    if (!profile) return
    setSaving(true)
    try {
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? '',
          phone_number: profile.phone_number ?? '',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to update profile')
      }
      setProfile(data.profile)
      toast.success('Profile updated')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update profile'
      console.error('Error updating profile:', error)
      toast.error('Could not update profile', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    } catch (error) {
      console.error('Error logging out:', error)
      toast.error('Logout failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
      </div>
    )
  }

  if (loadError && !profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load profile</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchUserProfile}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your profile and preferences</p>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={profile?.email ?? ''} disabled />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={profile?.first_name ?? ''}
                onChange={(e) =>
                  profile && setProfile({ ...profile, first_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={profile?.last_name ?? ''}
                onChange={(e) =>
                  profile && setProfile({ ...profile, last_name: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={profile?.phone_number ?? ''}
              onChange={(e) =>
                profile && setProfile({ ...profile, phone_number: e.target.value })
              }
              placeholder="+267..."
            />
          </div>
          <Button onClick={handleUpdateProfile} className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose what notifications you want to receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {Object.entries(notifications).map(([key, value]) => (
              <label key={key} className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) =>
                    setNotifications({ ...notifications, [key]: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="capitalize">
                  {key === 'transactions' && 'Transaction Alerts'}
                  {key === 'security' && 'Security Notifications'}
                  {key === 'promotions' && 'Promotional Updates'}
                  {key === 'system' && 'System Messages'}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Preferences are stored locally for now — a server-side endpoint will be wired up later.
          </p>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your account security</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            Logout
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
