'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Wallet {
  id: string
  user_id: string
  name: string | null
  wallet_number: string
  currency: string
  balance: number
  daily_limit: number
  daily_spent: number
  monthly_limit: number
  monthly_spent: number
  status: string
  created_at: string
}

interface QrCode {
  id: string
  token: string
  description: string
  amount: number
  currency: string
  qr_image_url: string | null
  single_use: boolean
  is_active: boolean
  paid_count: number
  expiry_at: string | null
  created_at: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  currency: string
  status: string
  from_wallet_id: string | null
  to_wallet_id: string | null
  description: string | null
  reference_id: string
  created_at: string
}

export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Rename UI
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/wallets/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load wallet')
      setWallet(data.wallet)
      setQrCodes(data.qrCodes ?? [])
      setTransactions(data.transactions ?? [])
      setNameDraft(data.wallet?.name ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  async function saveName() {
    if (!wallet) return
    setSaving(true)
    try {
      const res = await fetch(`/api/wallets/${wallet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? 'Failed to rename'
        setError(msg)
        toast.error('Could not rename wallet', { description: msg })
        return
      }
      setWallet(data.wallet)
      setEditingName(false)
      toast.success('Wallet renamed', {
        description: data.wallet?.name || 'Cleared',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      toast.error('Could not rename wallet', { description: msg })
    } finally {
      setSaving(false)
    }
  }

  async function copyWalletNumber() {
    if (!wallet) return
    try {
      await navigator.clipboard.writeText(wallet.wallet_number)
    } catch {
      // ignore
    }
  }

  function direction(t: Transaction): 'out' | 'in' {
    return t.from_wallet_id === id ? 'out' : 'in'
  }

  if (loading) return <p className="text-gray-500">Loading wallet…</p>
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn't load wallet</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!wallet) return null

  const displayName = wallet.name || wallet.wallet_number

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={60}
                autoFocus
                className="max-w-sm text-lg"
              />
              <Button size="sm" onClick={saveName} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingName(false)
                  setNameDraft(wallet.name ?? '')
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold truncate">{displayName}</h1>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNameDraft(wallet.name ?? '')
                  setEditingName(true)
                }}
              >
                Rename
              </Button>
              <Badge variant={wallet.status === 'active' ? 'default' : 'outline'}>
                {wallet.status}
              </Badge>
            </div>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">← Dashboard</Link>
        </Button>
      </div>

      {/* Balance + wallet number */}
      <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
        <CardContent className="py-6 space-y-4">
          <div>
            <p className="text-sm opacity-80">Balance</p>
            <p className="text-4xl font-bold mt-1">P{wallet.balance.toFixed(2)}</p>
            <p className="text-xs opacity-75 mt-1">{wallet.currency}</p>
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-white/20">
            <div className="min-w-0 flex-1">
              <p className="text-xs opacity-80">Wallet number (share to receive)</p>
              <p className="font-mono text-sm truncate">{wallet.wallet_number}</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={copyWalletNumber}
              className="text-blue-700"
            >
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button asChild>
          <Link href={`/dashboard/topup?wallet=${wallet.id}`}>Top up</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/transfers?from=${wallet.id}`}>Transfer</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/dashboard/qr-codes/new?wallet=${wallet.id}`}>+ QR code</Link>
        </Button>
      </div>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Daily</p>
            <p className="font-medium">
              P{wallet.daily_spent.toFixed(2)} / P{wallet.daily_limit.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Monthly</p>
            <p className="font-medium">
              P{wallet.monthly_spent.toFixed(2)} / P{wallet.monthly_limit.toFixed(2)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* QR codes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>QR codes</CardTitle>
            <CardDescription>Payment links attached to this wallet</CardDescription>
          </div>
          <Button asChild size="sm">
            <Link href={`/dashboard/qr-codes/new?wallet=${wallet.id}`}>+ New</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {qrCodes.length === 0 ? (
            <p className="text-sm text-gray-500">No QR codes for this wallet yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {qrCodes.map((q) => {
                const expired = q.expiry_at && new Date(q.expiry_at) <= new Date()
                const exhausted = q.single_use && q.paid_count > 0
                const payable = q.is_active && !expired && !exhausted
                return (
                  <div
                    key={q.id}
                    className="flex items-center gap-3 rounded-md border p-3"
                  >
                    {q.qr_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={q.qr_image_url}
                        alt={q.description}
                        width={64}
                        height={64}
                        className="rounded"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{q.description}</p>
                      <p className="text-sm text-gray-600">
                        P{Number(q.amount).toFixed(2)}
                        {q.single_use && ' · single-use'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {payable ? 'Active' : exhausted ? 'Paid' : expired ? 'Expired' : 'Inactive'}
                        {' · '}
                        {q.paid_count} {q.paid_count === 1 ? 'payment' : 'payments'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 20 transactions on this wallet</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/transactions">All transactions</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-500">No transactions yet.</p>
          ) : (
            <ul className="divide-y">
              {transactions.map((t) => {
                const dir = direction(t)
                const sign = dir === 'out' ? '-' : '+'
                const color = dir === 'out' ? 'text-red-600' : 'text-green-600'
                return (
                  <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium capitalize">{t.type}</p>
                      {t.description && (
                        <p className="text-sm text-gray-600 truncate">{t.description}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(t.created_at).toLocaleString()} · {t.reference_id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${color}`}>
                        {sign}P{Number(t.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">{t.status}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
