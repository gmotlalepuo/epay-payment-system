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
import { parsePaymentAmount, validateWalletPaymentAmount, walletLabel } from '@/lib/payment-validation'

type Wallet = {
  id: string
  name: string | null
  wallet_number: string
  balance: number
  currency: string
  status: string
}

type Recipient = {
  wallet_number: string
  wallet_name: string | null
  currency: string
  wallet_status: string
  owner_name: string
  owner_status: string
  payable: boolean
}

export default function TransfersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fromWalletId, setFromWalletId] = useState(searchParams.get('from') || '')
  const [toWalletNumber, setToWalletNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [verifyingRecipient, setVerifyingRecipient] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function loadWallets() {
      try {
        const response = await apiFetch('/api/wallets')
        if (response.ok) {
          const data = await response.json()
          setWallets((data.wallets || []).filter((wallet: Wallet) => wallet.status === 'active'))
        }
      } catch (err) {
        console.error('[transfers] Error loading wallets:', err)
      }
    }

    void loadWallets()
  }, [])

  const selectedWallet = wallets.find((wallet) => wallet.id === fromWalletId) ?? null
  const amountError = amount ? validateWalletPaymentAmount(amount, selectedWallet) : null
  const canReview = Boolean(fromWalletId && toWalletNumber.trim() && amount) && !amountError && !isLoading

  async function verifyRecipient() {
    setRecipient(null)
    setVerifyingRecipient(true)

    try {
      const response = await apiFetch(
        `/api/wallets/lookup?wallet_number=${encodeURIComponent(toWalletNumber.trim())}`,
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not verify recipient')
      setRecipient(data.recipient)
      return data.recipient as Recipient
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not verify recipient'
      setError(msg)
      toast.error('Recipient check failed', { description: msg })
      return null
    } finally {
      setVerifyingRecipient(false)
    }
  }

  async function handleReview(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const validation = validateWalletPaymentAmount(amount, selectedWallet)
    if (validation) {
      setError(validation)
      return
    }

    const verified = await verifyRecipient()
    if (!verified) return
    if (!verified.payable) {
      setError('The recipient account or wallet is not active.')
      return
    }

    setReviewOpen(true)
  }

  async function handleTransfer() {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await apiFetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_wallet_id: fromWalletId,
          to_wallet_number: toWalletNumber.trim(),
          amount: parsePaymentAmount(amount),
          description,
          idempotency_key: crypto.randomUUID(),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        const msg = data.error || 'Transfer failed'
        setError(msg)
        toast.error('Transfer failed', { description: msg })
        return
      }

      setSuccess(`Transfer sent. Reference: ${data.reference_id}`)
      toast.success('Transfer sent', {
        description: `P${(parsePaymentAmount(amount) ?? 0).toFixed(2)} to ${recipient?.owner_name ?? toWalletNumber}`,
      })
      setReviewOpen(false)
      setFromWalletId('')
      setToWalletNumber('')
      setAmount('')
      setDescription('')
      setRecipient(null)
      setTimeout(() => router.push('/dashboard/transactions'), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred'
      setError(msg)
      toast.error('Transfer failed', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Send Money</h1>
        <p className="mt-2 text-muted-foreground">Transfer funds to another active wallet instantly.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Transfer</CardTitle>
          <CardDescription>Verify the recipient and review the payment before sending.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReview} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="from-wallet">From Wallet</Label>
              <select
                id="from-wallet"
                value={fromWalletId}
                onChange={(e) => setFromWalletId(e.target.value)}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select a wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {walletLabel(wallet)}
                  </option>
                ))}
              </select>
              {wallets.length === 0 && (
                <p className="text-sm text-red-600">You need an active wallet before you can send money.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-wallet">Recipient wallet number</Label>
              <Input
                id="to-wallet"
                placeholder="Enter recipient wallet number"
                value={toWalletNumber}
                onChange={(e) => {
                  setToWalletNumber(e.target.value)
                  setRecipient(null)
                }}
                required
              />
              <p className="text-xs text-muted-foreground">We will verify the recipient before you confirm.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (BWP)</Label>
              <div className="flex gap-2">
                <span className="flex items-center text-muted-foreground">P</span>
                <Input
                  id="amount"
                  type="number"
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

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="What is this transfer for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!canReview || wallets.length === 0 || verifyingRecipient}>
              {verifyingRecipient && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {verifyingRecipient ? 'Checking recipient...' : 'Review transfer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="text-lg">Transfer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900">
          <p>Transfers are instant and irreversible.</p>
          <p>Both wallets must be active.</p>
          <p>You cannot transfer more than your available balance.</p>
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="mt-6 w-full">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Check the recipient and amount before sending. This action cannot be reversed here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
            <p>
              <span className="font-medium">From:</span> {selectedWallet ? walletLabel(selectedWallet) : 'Selected wallet'}
            </p>
            <p>
              <span className="font-medium">Recipient:</span> {recipient?.owner_name} ({recipient?.wallet_number})
            </p>
            <p>
              <span className="font-medium">Amount:</span> P{(parsePaymentAmount(amount) ?? 0).toFixed(2)}
            </p>
            {description && (
              <p>
                <span className="font-medium">Description:</span> {description}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleTransfer} disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Confirm and send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
