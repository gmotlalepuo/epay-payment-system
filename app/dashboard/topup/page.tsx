'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api-client'
import { parsePaymentAmount, validatePositiveAmount, walletLabel } from '@/lib/payment-validation'

interface Wallet {
  id: string
  name: string | null
  wallet_number: string
  balance: number
  status: string
  currency: string
}

const QUICK_AMOUNTS = [50, 100, 200, 500]
const MIN_TOPUP_AMOUNT = 8

export default function TopupPage() {
  const searchParams = useSearchParams()
  const cancelled = searchParams.get('cancelled') === '1'
  const preselected = searchParams.get('wallet') ?? ''

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletId, setWalletId] = useState(preselected)
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const res = await apiFetch('/api/wallets')
      if (res.ok) {
        const data = await res.json()
        const active = (data.wallets ?? []).filter((wallet: Wallet) => wallet.status === 'active')
        setWallets(active)
        if (!preselected && active.length === 1) setWalletId(active[0].id)
      }
    }

    void load()
  }, [preselected])

  const selectedWallet = wallets.find((wallet) => wallet.id === walletId) ?? null
  const amountError = amount ? validatePositiveAmount(amount, MIN_TOPUP_AMOUNT) : null
  const canReview = Boolean(walletId && amount) && !amountError && !submitting

  function handleReview(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const validation = validatePositiveAmount(amount, MIN_TOPUP_AMOUNT)
    if (validation) {
      setError(validation)
      return
    }
    if (!selectedWallet) {
      setError('Select an active wallet.')
      return
    }
    setReviewOpen(true)
  }

  async function startCheckout() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: walletId || undefined,
          amount: parsePaymentAmount(amount),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        const msg = data.error ?? 'Failed to start top-up'
        setError(msg)
        toast.error('Could not start top-up', { description: msg })
        return
      }
      toast.info('Redirecting to secure card checkout...')
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
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Top up wallet</h1>
        <p className="mt-1 text-muted-foreground">
          Add funds with a card via Stripe. We verify the final payment status before showing success.
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
          <form onSubmit={handleReview} className="space-y-5">
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
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {walletLabel(wallet)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Quick pick</Label>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map((quickAmount) => (
                  <Button
                    key={quickAmount}
                    type="button"
                    variant={amount === String(quickAmount) ? 'default' : 'outline'}
                    onClick={() => setAmount(String(quickAmount))}
                  >
                    P{quickAmount}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (BWP)</Label>
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">P</span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min={MIN_TOPUP_AMOUNT}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              {amountError && <p className="text-sm text-red-600">{amountError}</p>}
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              You will be redirected to Stripe Checkout to enter your card. In test mode, use card{' '}
              <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC.
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={!canReview || wallets.length === 0} className="flex-1">
                Review top-up
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm top-up</AlertDialogTitle>
            <AlertDialogDescription>
              Review the wallet and amount before opening secure card checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <p><span className="font-medium">Wallet:</span> {selectedWallet ? walletLabel(selectedWallet) : 'Selected wallet'}</p>
            <p><span className="font-medium">Amount:</span> P{(parsePaymentAmount(amount) ?? 0).toFixed(2)}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startCheckout} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {submitting ? 'Opening...' : 'Continue to checkout'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
