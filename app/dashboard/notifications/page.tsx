'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
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

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  link_url?: string | null
}

function iconFor(type: string) {
  switch (type) {
    case 'transaction':
      return <DollarSign className="h-5 w-5 text-emerald-600" />
    case 'security':
      return <Shield className="h-5 w-5 text-amber-600" />
    case 'wallet':
      return <WalletIcon className="h-5 w-5 text-blue-600" />
    case 'complaint':
      return <AlertTriangle className="h-5 w-5 text-orange-600" />
    default:
      return <Info className="h-5 w-5 text-gray-500" />
  }
}

type Filter = 'all' | 'unread'

export default function NotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/notifications')
      if (r.ok) {
        const d = await r.json()
        setItems(d.notifications ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: ids, isRead: true }),
    })
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
    )
  }

  async function markAllRead() {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id)
    if (ids.length === 0) return
    setMarking(true)
    try {
      await markRead(ids)
    } finally {
      setMarking(false)
    }
  }

  function handleClick(n: Notification) {
    if (!n.is_read) void markRead([n.id])
    const dest = n.link_url || `/dashboard/notifications/${n.id}`
    router.push(dest)
  }

  const filtered = filter === 'unread' ? items.filter((n) => !n.is_read) : items
  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7" />
            Notifications
          </h1>
          <p className="text-gray-600 mt-1">
            {unreadCount === 0
              ? 'You are all caught up.'
              : `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllRead} disabled={marking}>
            {marking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark all read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({items.length})
        </Button>
        <Button
          variant={filter === 'unread' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClick(n)}
              className={`w-full text-left border rounded-lg p-4 hover:shadow-md transition-shadow ${
                !n.is_read ? 'bg-blue-50/60 border-blue-200' : 'bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{iconFor(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{n.title}</h3>
                    <Badge variant="outline" className="text-xs capitalize">
                      {n.type}
                    </Badge>
                    {!n.is_read && (
                      <Badge className="bg-blue-500 text-white text-xs">New</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{n.message}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Button asChild variant="outline" className="w-full mt-4">
        <Link href="/dashboard">← Back to dashboard</Link>
      </Button>
    </div>
  )
}
