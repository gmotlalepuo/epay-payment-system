'use client'

import { useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

interface UserProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone_number: string | null
}

type NotificationPreferences = {
  payment_notifications: boolean
  security_notifications: boolean
  wallet_notifications: boolean
  complaint_notifications: boolean
  merchant_notifications: boolean
  email_notifications: boolean
  sms_notifications: boolean
  in_app_notifications: boolean
}

type PaymentSecurityPreferences = {
  confirm_transfers: boolean
  confirm_qr_payments: boolean
  confirm_topups: boolean
}

type SecuritySettings = {
  session: { email: string | null; expires_at: number | null }
  profile: {
    email: string
    status: string
    two_factor_enabled: boolean
    failed_login_attempts: number
    last_login_at: string | null
    updated_at: string | null
  } | null
  notification_preferences: NotificationPreferences
  payment_security_preferences: PaymentSecurityPreferences
  linked_sessions_supported: boolean
  login_activity_supported: boolean
}

const notificationLabels: Record<keyof NotificationPreferences, string> = {
  payment_notifications: 'Payment notifications',
  security_notifications: 'Security notifications',
  wallet_notifications: 'Wallet notifications',
  complaint_notifications: 'Complaint notifications',
  merchant_notifications: 'Merchant notifications',
  email_notifications: 'Email notifications',
  sms_notifications: 'SMS notifications',
  in_app_notifications: 'In-app notifications',
}

const paymentLabels: Record<keyof PaymentSecurityPreferences, string> = {
  confirm_transfers: 'Require transfer confirmation',
  confirm_qr_payments: 'Require QR payment confirmation',
  confirm_topups: 'Require top-up confirmation',
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingSecurity, setSavingSecurity] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setLoadError(null)
    try {
      const [profileResponse, securityResponse] = await Promise.all([
        apiFetch('/api/users/profile'),
        apiFetch('/api/users/security-settings'),
      ])
      const profileData = await profileResponse.json()
      const securityData = await securityResponse.json()
      if (!profileResponse.ok) throw new Error(profileData.error ?? 'Failed to fetch profile')
      if (!securityResponse.ok) throw new Error(securityData.error ?? 'Failed to fetch security settings')
      setProfile(profileData.profile)
      setSecuritySettings(securityData)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load settings'
      setLoadError(msg)
      toast.error('Could not load settings', { description: msg })
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateProfile() {
    if (!profile) return
    setSavingProfile(true)
    try {
      const response = await apiFetch('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: profile.first_name ?? '',
          last_name: profile.last_name ?? '',
          phone_number: profile.phone_number ?? '',
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Failed to update profile')
      setProfile(data.profile)
      toast.success('Profile updated')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update profile'
      toast.error('Could not update profile', { description: msg })
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveSecuritySettings(next: SecuritySettings) {
    setSecuritySettings(next)
    setSavingSecurity(true)
    try {
      const response = await apiFetch('/api/users/security-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_preferences: next.notification_preferences,
          payment_security_preferences: next.payment_security_preferences,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Failed to save settings')
      setSecuritySettings((current) =>
        current
          ? {
              ...current,
              notification_preferences: data.notification_preferences,
              payment_security_preferences: data.payment_security_preferences,
            }
          : current,
      )
      toast.success('Security settings saved')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save settings'
      toast.error('Could not save settings', { description: msg })
      void loadSettings()
    } finally {
      setSavingSecurity(false)
    }
  }

  async function sendPasswordReset() {
    const email = profile?.email
    if (!email) return
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/login`,
      })
      if (error) throw error
      toast.success('Password reset sent', { description: `Check ${email}.` })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Could not send reset email'
      toast.error('Password reset failed', { description: msg })
    } finally {
      setSendingReset(false)
    }
  }

  function updateNotification(key: keyof NotificationPreferences, value: boolean) {
    if (!securitySettings) return
    void saveSecuritySettings({
      ...securitySettings,
      notification_preferences: {
        ...securitySettings.notification_preferences,
        [key]: value,
      },
    })
  }

  function updatePaymentSecurity(key: keyof PaymentSecurityPreferences, value: boolean) {
    if (!securitySettings) return
    void saveSecuritySettings({
      ...securitySettings,
      payment_security_preferences: {
        ...securitySettings.payment_security_preferences,
        [key]: value,
      },
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading settings...
      </div>
    )
  }

  if (loadError && !profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load settings</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={loadSettings}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage your profile, session, and security preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session status</CardTitle>
          <CardDescription>Current account and authentication state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Signed in as" value={securitySettings?.session.email ?? profile?.email ?? 'Unknown'} />
          <Info label="Account status" value={securitySettings?.profile?.status ?? 'active'} />
          <Info label="Two-factor status" value={securitySettings?.profile?.two_factor_enabled ? 'Enabled' : 'Not enabled'} />
          <Info label="Failed login attempts" value={String(securitySettings?.profile?.failed_login_attempts ?? 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input value={profile?.email ?? ''} disabled />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                value={profile?.first_name ?? ''}
                onChange={(e) => profile && setProfile({ ...profile, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                value={profile?.last_name ?? ''}
                onChange={(e) => profile && setProfile({ ...profile, last_name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              value={profile?.phone_number ?? ''}
              onChange={(e) => profile && setProfile({ ...profile, phone_number: e.target.value })}
              placeholder="+267..."
            />
          </div>
          <Button onClick={handleUpdateProfile} className="w-full" disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 size-4 animate-spin" />}
            {savingProfile ? 'Saving...' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password and security actions</CardTitle>
          <CardDescription>Use email recovery to change your password securely.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <p>
              Password changes are handled through Supabase Auth email recovery so the change is verified outside this active session.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={sendPasswordReset} disabled={sendingReset}>
            {sendingReset && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send password reset email
          </Button>
        </CardContent>
      </Card>

      {securitySettings && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Notification preferences</CardTitle>
              <CardDescription>Choose which account and payment events should notify you.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(Object.keys(notificationLabels) as Array<keyof NotificationPreferences>).map((key) => (
                <ToggleRow
                  key={key}
                  label={notificationLabels[key]}
                  checked={securitySettings.notification_preferences[key]}
                  disabled={savingSecurity}
                  onCheckedChange={(value) => updateNotification(key, value)}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment confirmation settings</CardTitle>
              <CardDescription>Keep review prompts enabled for sensitive payment actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(Object.keys(paymentLabels) as Array<keyof PaymentSecurityPreferences>).map((key) => (
                <ToggleRow
                  key={key}
                  label={paymentLabels[key]}
                  checked={securitySettings.payment_security_preferences[key]}
                  disabled={savingSecurity}
                  onCheckedChange={(value) => updatePaymentSecurity(key, value)}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Login activity</CardTitle>
              <CardDescription>Recent login signals from the backend.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {securitySettings.login_activity_supported && securitySettings.profile?.last_login_at
                ? `Last login: ${new Date(securitySettings.profile.last_login_at).toLocaleString()}`
                : 'Detailed login activity is not available from the backend yet.'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Linked devices and sessions</CardTitle>
              <CardDescription>Manage active devices when backend session listing is available.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Linked device/session management is not available from the backend yet.
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}
