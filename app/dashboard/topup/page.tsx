'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Wallet {
  id: string
  name: string | null
  wallet_number: string
  balance: number
  status: string
  currency: string
}

const QUICK_AMOUNTS = [50, 100, 200, 500]

export default function TopupPage() {
  const searchParams = useSearchParams()
  const cancelled = searchParams.get('cancelled') === '1'
  const preselected = searchParams.get('wallet') ?? ''

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletId, setWalletId] = useState(preselected)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/wallets')
      if (res.ok) {
        const data = await res.json()
        const active = (data.wallets ?? []).filter((w: Wallet) => w.status === 'active')
        setWallets(active)
        if (!preselected && active.length === 1) setWalletId(active[0].id)
      }
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: walletId || undefined,
          amount: parseFloat(amount),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        const msg = data.error ?? 'Failed to start top-up'
        setError(msg)
        toast.error('Could not start top-up', { description: msg })
        return
      }
      toast.info('Redirecting to Stripe…')
      // Stripe Checkout takes over the browser
      window.location.assign(data.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      toast.error('Could not start top-up', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Top up wallet</h1>
        <p className="text-gray-600 mt-1">
          Add funds with a card via Stripe. Money is credited as soon as Stripe confirms the
          payment.
        </p>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Top-up cancelled. No charge was made.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>How much?</CardTitle>
          <CardDescription>Choose a quick amount or enter a custom one.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {wallets.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="wallet">Wallet</Label>
                <select
                  id="wallet"
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a wallet</option>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name ? `${w.name} — ` : ''}{w.wallet_number} — P{Number(w.balance).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Quick pick</Label>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant={amount === String(q) ? 'default' : 'outline'}
                    onClick={() => setAmount(String(q))}
                  >
                    P{q}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (BWP)</Label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">P</span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min="8"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
              You'll be redirected to Stripe Checkout to enter your card. In test mode, use card{' '}
              <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={submitting || !amount || (wallets.length > 1 && !walletId)}
                className="flex-1"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting ? 'Starting…' : `Top up P${amount || '0.00'}`}
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
