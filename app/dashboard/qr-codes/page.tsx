'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatTimestamp, ListPagination, ListToolbar, usePagedItems } from '@/components/list-tools'
import { apiFetch } from '@/lib/api-client'

interface QrCode {
  id: string
  wallet_id: string
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

interface Wallet {
  id: string
  wallet_number: string
  name: string | null
  currency: string
  status: string
}

function walletLabel(wallet?: Wallet) {
  if (!wallet) return 'Unknown wallet'
  return wallet.name ? `${wallet.name} (${wallet.wallet_number})` : wallet.wallet_number
}

export default function QrCodesListPage() {
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [useFilter, setUseFilter] = useState('all')
  const [walletFilter, setWalletFilter] = useState('all')

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [qrRes, walletRes] = await Promise.all([
        apiFetch('/api/qr-codes'),
        apiFetch('/api/wallets'),
      ])
      const [qrData, walletData] = await Promise.all([qrRes.json(), walletRes.json()])
      if (!qrRes.ok) throw new Error(qrData.error ?? 'Failed to load QR codes')
      if (!walletRes.ok) throw new Error(walletData.error ?? 'Failed to load wallets')
      setQrCodes(qrData.qrCodes ?? [])
      setWallets(walletData.wallets ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setPendingId(id)
    try {
      const res = await apiFetch(`/api/qr-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error('Could not update QR code', { description: data.error })
        return
      }
      setQrCodes((prev) =>
        prev.map((q) => (q.id === id ? { ...q, is_active: !isActive } : q)),
      )
      toast.success(!isActive ? 'QR code activated' : 'QR code deactivated')
    } finally {
      setPendingId(null)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  async function deleteQrCode(q: QrCode) {
    const confirmed = window.confirm(
      `Delete QR code "${q.description}"? This cannot be undone. QR codes with completed payments should be deactivated instead.`,
    )
    if (!confirmed) return

    setDeletePendingId(q.id)
    try {
      const res = await apiFetch(`/api/qr-codes/${q.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error('Could not delete QR code', { description: data.error })
        return
      }
      setQrCodes((prev) => prev.filter((item) => item.id !== q.id))
      toast.success('QR code deleted')
    } finally {
      setDeletePendingId(null)
    }
  }

  function statusFor(q: QrCode) {
    const expired = q.expiry_at && new Date(q.expiry_at) <= new Date()
    const exhausted = q.single_use && q.paid_count > 0
    if (exhausted) return 'paid'
    if (expired) return 'expired'
    if (!q.is_active) return 'inactive'
    return 'active'
  }

  const filteredQrCodes = useMemo(() => {
    const term = search.trim().toLowerCase()
    const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]))

    return qrCodes.filter((q) => {
      const status = statusFor(q)
      const wallet = walletById.get(q.wallet_id)
      const matchesSearch =
        !term ||
        [
          q.description,
          q.token,
          q.currency,
          String(q.amount),
          String(q.paid_count),
          wallet?.name,
          wallet?.wallet_number,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return (
        matchesSearch &&
        (walletFilter === 'all' || q.wallet_id === walletFilter) &&
        (statusFilter === 'all' || status === statusFilter) &&
        (useFilter === 'all' ||
          (useFilter === 'single' && q.single_use) ||
          (useFilter === 'reusable' && !q.single_use))
      )
    })
  }, [qrCodes, search, statusFilter, useFilter, walletFilter, wallets])

  const { page, setPage, totalPages, pagedItems } = usePagedItems(
    filteredQrCodes,
    8,
    `${search}|${statusFilter}|${useFilter}|${walletFilter}`,
  )

  const walletById = useMemo(() => new Map(wallets.map((wallet) => [wallet.id, wallet])), [wallets])

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment QR codes</h1>
          <p className="text-gray-600 mt-1">
            Generate QR codes for items or services. Anyone can scan to pay you.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/qr-codes/new">New QR</Link>
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : qrCodes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 mb-4">You haven't created any QR codes yet.</p>
            <Button asChild>
              <Link href="/dashboard/qr-codes/new">Create your first QR</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search QR codes"
            filters={[
              {
                label: 'Wallet',
                value: walletFilter,
                onChange: setWalletFilter,
                options: [
                  { label: 'All wallets', value: 'all' },
                  ...wallets.map((wallet) => ({
                    label: walletLabel(wallet),
                    value: wallet.id,
                  })),
                ],
              },
              {
                label: 'Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Inactive', value: 'inactive' },
                  { label: 'Paid', value: 'paid' },
                  { label: 'Expired', value: 'expired' },
                ],
              },
              {
                label: 'Use',
                value: useFilter,
                onChange: setUseFilter,
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Single use', value: 'single' },
                  { label: 'Reusable', value: 'reusable' },
                ],
              },
            ]}
          />

          {filteredQrCodes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No QR codes match your search or filters.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pagedItems.map((q) => {
                const expired = q.expiry_at && new Date(q.expiry_at) <= new Date()
                const exhausted = q.single_use && q.paid_count > 0
                const payable = q.is_active && !expired && !exhausted
                const payUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${q.token}`
                const wallet = walletById.get(q.wallet_id)

                return (
                  <Card key={q.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate">{q.description}</CardTitle>
                          <CardDescription>
                            P{Number(q.amount).toFixed(2)} {q.currency}
                          </CardDescription>
                          <p className="mt-1 text-xs text-gray-500">
                            Wallet: {walletLabel(wallet)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {payable ? (
                            <Badge variant="default">Active</Badge>
                          ) : exhausted ? (
                            <Badge variant="secondary">Paid</Badge>
                          ) : expired ? (
                            <Badge variant="outline">Expired</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                          {q.single_use && <Badge variant="outline">Single use</Badge>}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {q.qr_image_url && (
                        <div className="flex justify-center bg-gray-50 rounded-md py-3">
                          <img
                            src={q.qr_image_url}
                            alt={`QR code for ${q.description}`}
                            width={200}
                            height={200}
                            className="block"
                          />
                        </div>
                      )}

                      <div className="text-xs text-gray-500 break-all">
                        <span className="font-medium">Pay link: </span>
                        {payUrl}
                      </div>

                      <div className="text-xs text-gray-500">
                        <span className="font-medium">Wallet: </span>
                        {walletLabel(wallet)}
                        {wallet?.status && ` · ${wallet.status}`}
                      </div>

                      <div className="text-xs text-gray-500">
                        Paid {q.paid_count} {q.paid_count === 1 ? 'time' : 'times'}
                        {q.expiry_at && ` · expires ${formatTimestamp(q.expiry_at)}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        Created {formatTimestamp(q.created_at)}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copy(payUrl)}
                        >
                          Copy link
                        </Button>
                        {!exhausted && !expired && (
                          <Button
                            type="button"
                            variant={q.is_active ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => toggle(q.id, q.is_active)}
                            disabled={pendingId === q.id}
                          >
                            {pendingId === q.id && (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            )}
                            {q.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteQrCode(q)}
                          disabled={deletePendingId === q.id}
                        >
                          {deletePendingId === q.id && (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          <ListPagination
            page={page}
            totalPages={totalPages}
            totalItems={filteredQrCodes.length}
            pageSize={8}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
