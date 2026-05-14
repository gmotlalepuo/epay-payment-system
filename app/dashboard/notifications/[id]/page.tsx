'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  DollarSign,
  Shield,
  Wallet as WalletIcon,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  read_at: string | null
  created_at: string
  link_url?: string | null
}

function iconFor(type: string) {
  switch (type) {
    case 'transaction':
      return <DollarSign className="h-6 w-6 text-emerald-600" />
    case 'security':
      return <Shield className="h-6 w-6 text-amber-600" />
    case 'wallet':
      return <WalletIcon className="h-6 w-6 text-blue-600" />
    case 'complaint':
      return <AlertTriangle className="h-6 w-6 text-orange-600" />
    default:
      return <Info className="h-6 w-6 text-gray-500" />
  }
}

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [notification, setNotification] = useState<Notification | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Direct Supabase query — RLS scopes this to the user's own notifications
      const { data, error: err } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (err) throw err
      if (!data) {
        setError('Notification not found')
        return
      }
      setNotification(data as Notification)

      // Mark as read on view
      if (!data.is_read) {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationIds: [id], isRead: true }),
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notification')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <p className="text-gray-500 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    )
  }

  if (error || !notification) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not load notification</CardTitle>
          <CardDescription>{error ?? 'Not found'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard/notifications">Back to notifications</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="mt-1">{iconFor(notification.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{notification.title}</CardTitle>
                <Badge variant="outline" className="capitalize">
                  {notification.type}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                {new Date(notification.created_at).toLocaleString()}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-800 whitespace-pre-wrap">{notification.message}</p>

          {notification.read_at && (
            <p className="text-xs text-gray-500">
              Read on {new Date(notification.read_at).toLocaleString()}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            {notification.link_url && (
              <Button asChild>
                <Link href={notification.link_url}>Open related page →</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/dashboard/notifications">All notifications</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
