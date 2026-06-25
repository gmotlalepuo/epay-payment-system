'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

export default function CreateQrPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselected = searchParams.get('wallet') ?? ''
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletId, setWalletId] = useState(preselected)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [singleUse, setSingleUse] = useState(false)
  const [expiryAt, setExpiryAt] = useState('')
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
  const amountError = amount ? validatePositiveAmount(amount) : null
  const canReview = Boolean(walletId && description.trim() && amount) && !amountError && !submitting

  function handleReview(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const validation = validatePositiveAmount(amount)
    if (validation) {
      setError(validation)
      return
    }
    if (!selectedWallet) {
      setError('Select an active receiving wallet.')
      return
    }
    setReviewOpen(true)
  }

  async function createQrCode() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: walletId || undefined,
          description: description.trim(),
          amount: parsePaymentAmount(amount),
          single_use: singleUse,
          expiry_at: expiryAt ? new Date(expiryAt).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.error ?? 'Failed to create QR code'
        setError(msg)
        toast.error('Could not create QR code', { description: msg })
        return
      }
      toast.success('QR code created', {
        description: `${description.trim()} - P${(parsePaymentAmount(amount) ?? 0).toFixed(2)}`,
      })
      router.push('/dashboard/qr-codes')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
      toast.error('Could not create QR code', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Payment QR</h1>
        <p className="mt-1 text-muted-foreground">
          Generate a QR code that anyone can scan to pay you for this item.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>QR details</CardTitle>
          <CardDescription>
            Payers see the amount and description before confirming payment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReview} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="wallet">Receiving wallet</Label>
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
              <Label htmlFor="description">What is this for?</Label>
              <Input
                id="description"
                placeholder="e.g. Hair Cut, Coffee, Invoice #4521"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Price (BWP)</Label>
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">P</span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              {amountError && <p className="text-sm text-red-600">{amountError}</p>}
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <input
                id="single_use"
                type="checkbox"
                checked={singleUse}
                onChange={(e) => setSingleUse(e.target.checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="single_use" className="cursor-pointer">
                  Single use
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use for one-off invoices. The QR auto-deactivates after the first successful payment.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_at">Expires (optional)</Label>
              <Input
                id="expiry_at"
                type="datetime-local"
                value={expiryAt}
                onChange={(e) => setExpiryAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Expired QR requests cannot be paid.</p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={!canReview} className="flex-1">
                Review QR request
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard/qr-codes">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm QR request</AlertDialogTitle>
            <AlertDialogDescription>
              Check the receiving wallet, amount, and expiry before creating this payment request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <p><span className="font-medium">Wallet:</span> {selectedWallet ? walletLabel(selectedWallet) : 'Selected wallet'}</p>
            <p><span className="font-medium">Description:</span> {description.trim()}</p>
            <p><span className="font-medium">Amount:</span> P{(parsePaymentAmount(amount) ?? 0).toFixed(2)}</p>
            <p><span className="font-medium">Use:</span> {singleUse ? 'Single use' : 'Reusable'}</p>
            {expiryAt && <p><span className="font-medium">Expires:</span> {new Date(expiryAt).toLocaleString()}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={createQrCode} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {submitting ? 'Creating...' : 'Create QR code'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
