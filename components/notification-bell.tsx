'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  DollarSign,
  Shield,
  Wallet as WalletIcon,
  AlertTriangle,
  Info,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  link_url?: string | null
}

const POLL_MS = 15_000

function iconFor(type: string) {
  switch (type) {
    case 'transaction':
      return <DollarSign className="h-4 w-4 text-emerald-600" />
    case 'security':
      return <Shield className="h-4 w-4 text-amber-600" />
    case 'wallet':
      return <WalletIcon className="h-4 w-4 text-blue-600" />
    case 'complaint':
      return <AlertTriangle className="h-4 w-4 text-orange-600" />
    default:
      return <Info className="h-4 w-4 text-gray-500" />
  }
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(1, Math.round((now - then) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    void load()
    const id = setInterval(load, POLL_MS)

    // Re-fetch whenever the tab regains focus or becomes visible — picks up
    // notifications written in another tab or by a server action that just ran.
    function onVisible() {
      if (document.visibilityState === 'visible') void load()
    }
    function onFocus() {
      void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function load() {
    try {
      const r = await fetch('/api/notifications')
      if (!r.ok) return
      const d = await r.json()
      setItems(d.notifications ?? [])
    } catch {
      // silent — bell shouldn't break the page on a hiccup
    }
  }

  const unread = items.filter((n) => !n.is_read).length
  const recent = items.slice(0, 10)

  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids, isRead: true }),
      })
      setItems((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
      )
    } catch {
      // ignore — next poll will reconcile
    }
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

  async function handleRowClick(n: Notification) {
    setOpen(false)
    if (!n.is_read) void markRead([n.id])
    // Default destination: full detail page if no explicit link
    const dest = n.link_url || `/dashboard/notifications/${n.id}`
    router.push(dest)
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} disabled={marking}>
              {marking ? 'Marking…' : 'Mark all read'}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              You're all caught up.
            </div>
          ) : (
            recent.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleRowClick(n)}
                className={`w-full text-left px-3 py-3 border-b last:border-0 hover:bg-gray-50 transition-colors ${
                  !n.is_read ? 'bg-blue-50/60' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{iconFor(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{n.title}</p>
                    <p className="text-xs text-gray-600 break-words">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            <Link href="/dashboard/notifications">See all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
