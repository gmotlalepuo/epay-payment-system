'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
      const res = await fetch('/api/qr-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_id: walletId || undefined,
          description: description.trim(),
          amount: parseFloat(amount),
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
        description: `${description.trim()} — $${parseFloat(amount).toFixed(2)}`,
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">New Payment QR</h1>
        <p className="text-gray-600 mt-1">
          Generate a QR code that anyone can scan to pay you for this item.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>QR details</CardTitle>
          <CardDescription>
            What's it for, and how much. The amount and description are locked into the QR — payers see them on scan and can't change them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {wallets.length > 1 && (
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
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name ? `${w.name} — ` : ''}{w.wallet_number} — ${w.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              <Label htmlFor="amount">Price (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-medium">$</span>
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
                <p className="text-xs text-gray-500 mt-1">
                  Use for one-off invoices. The QR auto-deactivates after the first successful
                  payment. Leave off for menu items / repeatable services.
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
              <p className="text-xs text-gray-500">
                After this time, scans land on a "QR expired" page.
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting ? 'Creating…' : 'Create QR code'}
              </Button>
              <Button asChild type="button" variant="outline">
                <Link href="/dashboard/qr-codes">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
