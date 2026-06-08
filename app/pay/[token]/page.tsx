'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PaymentReceipt } from '@/components/payment-receipt'

interface ResolvedQr {
  id: string
  wallet_id: string
  description: string
  amount: number
  currency: string
  single_use: boolean
  is_active: boolean
  paid_count: number
  expiry_at: string | null
  receiver_name: string
  receiver_user_id: string
}

interface Wallet {
  id: string
  name: string | null
  wallet_number: string
  balance: number
  status: string
  currency: string
}

type ResolveResponse = { qr: ResolvedQr; payable: boolean; reason: string | null }

export default function PayLanding() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [resolving, setResolving] = useState(true)
  const [qr, setQr] = useState<ResolvedQr | null>(null)
  const [payable, setPayable] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const [authChecked, setAuthChecked] = useState(false)
  const [authedUserId, setAuthedUserId] = useState<string | null>(null)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [fromWalletId, setFromWalletId] = useState('')

  const [paying, setPaying] = useState(false)
  const [cardPaying, setCardPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [cardPayError, setCardPayError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{ reference_id: string; paid_at: string } | null>(null)

  // Resolve the QR (public endpoint)
  useEffect(() => {
    let alive = true
    async function go() {
      try {
        const res = await fetch(`/api/qr-codes/resolve/${params.token}`)
        const data = await res.json()
        if (!alive) return
        if (!res.ok) {
          setResolveError(data.error ?? 'Failed to resolve QR')
          return
        }
        const r = data as ResolveResponse
        setQr(r.qr)
        setPayable(r.payable)
        setReason(r.reason)
      } catch (err) {
        if (alive) setResolveError(err instanceof Error ? err.message : 'Network error')
      } finally {
        if (alive) setResolving(false)
      }
    }
    void go()
    return () => {
      alive = false
    }
  }, [params.token])

  // Check auth and load wallets if logged in
  useEffect(() => {
    let alive = true
    async function go() {
      const { data } = await supabase.auth.getUser()
      if (!alive) return
      setAuthedUserId(data.user?.id ?? null)
      setAuthChecked(true)
      if (data.user) {
        const res = await fetch('/api/wallets')
        if (res.ok) {
          const j = await res.json()
          const active = (j.wallets ?? []).filter((w: Wallet) => w.status === 'active')
          setWallets(active)
          if (active.length === 1) setFromWalletId(active[0].id)
        }
      }
    }
    void go()
    return () => {
      alive = false
    }
  }, [supabase])

  async function handlePay() {
    if (!qr) return
    setPayError(null)
    setPaying(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_wallet_id: fromWalletId,
          qr_code_id: qr.id,
          idempotency_key: `qr-${qr.id}-${fromWalletId}-${Date.now()}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? 'Payment failed'
        setPayError(msg)
        toast.error('Payment failed', { description: msg })
        return
      }
      toast.success('Payment sent', {
        description: `$${qr.amount.toFixed(2)} to ${qr.receiver_name || 'recipient'}`,
      })
      setReceipt({ reference_id: data.reference_id, paid_at: new Date().toISOString() })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setPayError(msg)
      toast.error('Payment failed', { description: msg })
    } finally {
      setPaying(false)
    }
  }

  async function handleCardCheckout() {
    if (!qr) return
    setCardPayError(null)
    setCardPaying(true)
    try {
      const res = await fetch('/api/qr-codes/card-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code_id: qr.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        const msg = data.error ?? 'Could not start card checkout'
        setCardPayError(msg)
        toast.error('Card checkout failed', { description: msg })
        return
      }
      window.location.href = data.url
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setCardPayError(msg)
      toast.error('Card checkout failed', { description: msg })
    } finally {
      setCardPaying(false)
    }
  }

  if (resolving) {
    return <Frame><p className="text-gray-500">Loading payment details…</p></Frame>
  }
  if (resolveError || !qr) {
    return (
      <Frame>
        <Card>
          <CardHeader>
            <CardTitle>QR code not found</CardTitle>
            <CardDescription>{resolveError ?? 'This link is invalid.'}</CardDescription>
          </CardHeader>
        </Card>
      </Frame>
    )
  }
  if (!payable) {
    return (
      <Frame>
        <Card>
          <CardHeader>
            <CardTitle>Can't pay this QR</CardTitle>
            <CardDescription>{reason}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{qr.receiver_name || 'Recipient'}</span> · {qr.description} · ${qr.amount.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </Frame>
    )
  }

  // Auth gate
  if (authChecked && !authedUserId) {
    const next = `/pay/${params.token}`
    return (
      <Frame>
        <Card>
          <CardHeader>
            <CardTitle>Sign in to pay</CardTitle>
            <CardDescription>
              You're paying <span className="font-medium">{qr.receiver_name || 'a Digital Wallet user'}</span> ${qr.amount.toFixed(2)} for {qr.description}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Button asChild>
                <Link href={`/auth/login?next=${encodeURIComponent(next)}`}>Login</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/auth/signup?next=${encodeURIComponent(next)}`}>Sign up</Link>
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleCardCheckout}
              disabled={cardPaying}
            >
              {cardPaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cardPaying ? 'Opening secure checkout...' : 'Pay with Visa/card'}
            </Button>
            {cardPayError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {cardPayError}
              </div>
            )}
          </CardContent>
        </Card>
      </Frame>
    )
  }

  // Self-pay friendly block
  if (authedUserId && authedUserId === qr.receiver_user_id) {
    return (
      <Frame>
        <Card>
          <CardHeader>
            <CardTitle>This is your QR code</CardTitle>
            <CardDescription>You can't pay yourself. Share the link with someone else.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/qr-codes">Back to my QR codes</Link>
            </Button>
          </CardContent>
        </Card>
      </Frame>
    )
  }

  // Receipt
  if (receipt) {
    return (
      <Frame>
        <Card>
          <CardHeader>
            <CardTitle>Payment successful</CardTitle>
            <CardDescription>Reference: {receipt.reference_id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <PaymentReceipt
              reference={receipt.reference_id}
              amount={qr.amount}
              currency={qr.currency}
              receiver={qr.receiver_name || 'Receiver'}
              description={qr.description}
              paidAt={receipt.paid_at}
              method="Wallet"
            />
            <div className="pt-3">
              <Button asChild variant="outline">
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Frame>
    )
  }

  // Confirmation form
  return (
    <Frame>
      <Card>
        <CardHeader>
          <CardTitle>Confirm payment</CardTitle>
          <CardDescription>Review the details before paying.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-gray-50 p-4 space-y-1">
            <div className="text-sm text-gray-500">You are paying</div>
            <div className="text-lg font-semibold">{qr.receiver_name || 'Digital Wallet user'}</div>
            <div className="text-sm text-gray-700">{qr.description}</div>
            <div className="text-2xl font-bold pt-2">${qr.amount.toFixed(2)}</div>
          </div>

          {wallets.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              You don't have an active wallet to pay from.
              <Link href="/dashboard/create-wallet" className="ml-1 underline">
                Create one
              </Link>{' '}
              first.
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="from">Pay from</Label>
              <select
                id="from"
                value={fromWalletId}
                onChange={(e) => setFromWalletId(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a wallet</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name ? `${w.name} — ` : ''}{w.wallet_number} — ${w.balance.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {payError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {payError}
            </div>
          )}

          {cardPayError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {cardPayError}
            </div>
          )}

          <Button
            onClick={handlePay}
            disabled={!fromWalletId || paying || wallets.length === 0}
            className="w-full"
            size="lg"
          >
            {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {paying ? 'Processing…' : `Pay $${qr.amount.toFixed(2)}`}
          </Button>

          <div className="text-center text-xs text-gray-500">or</div>

          <Button
            type="button"
            variant="secondary"
            onClick={handleCardCheckout}
            disabled={cardPaying}
            className="w-full"
            size="lg"
          >
            {cardPaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cardPaying ? 'Opening secure checkout...' : 'Pay with Visa/card'}
          </Button>
        </CardContent>
      </Card>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
