'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function TransfersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [fromWalletId, setFromWalletId] = useState(searchParams.get('from') || '')
  const [toWalletNumber, setToWalletNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [wallets, setWallets] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function loadWallets() {
      try {
        const response = await fetch('/api/wallets')
        if (response.ok) {
          const data = await response.json()
          setWallets(data.wallets || [])
        }
      } catch (err) {
        console.error('[v0] Error loading wallets:', err)
      }
    }
    loadWallets()
  }, [])

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_wallet_id: fromWalletId,
          to_wallet_number: toWalletNumber,
          amount: parseFloat(amount),
          description,
        }),
      })

      if (response.ok) {
        setSuccess('Transfer initiated successfully!')
        toast.success('Transfer sent', {
          description: `P${parseFloat(amount).toFixed(2)} to ${toWalletNumber}`,
        })
        setFromWalletId('')
        setToWalletNumber('')
        setAmount('')
        setDescription('')
        setTimeout(() => router.push('/dashboard/transactions'), 1500)
      } else {
        const data = await response.json()
        const msg = data.error || 'Transfer failed'
        setError(msg)
        toast.error('Transfer failed', { description: msg })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred'
      setError(msg)
      toast.error('Transfer failed', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Send Money</h1>
        <p className="text-gray-600 mt-2">Transfer funds to another wallet instantly</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Transfer</CardTitle>
          <CardDescription>Send money to another wallet by their wallet number</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTransfer} className="space-y-6">
            {/* From Wallet */}
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
                    {wallet.name ? `${wallet.name} — ` : ''}{wallet.wallet_number} — P{wallet.balance.toFixed(2)}
                  </option>
                ))}
              </select>
              {wallets.length === 0 && (
                <p className="text-sm text-red-600">
                  You need to create a wallet first
                </p>
              )}
            </div>

            {/* To Wallet Number */}
            <div className="space-y-2">
              <Label htmlFor="to-wallet">To Wallet Number</Label>
              <Input
                id="to-wallet"
                placeholder="Enter recipient&apos;s wallet number"
                value={toWalletNumber}
                onChange={(e) => setToWalletNumber(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">
                Ask the recipient for their wallet number
              </p>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (BWP)</Label>
              <div className="flex gap-2">
                <span className="flex items-center text-gray-600">P</span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="What is this transfer for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={isLoading || wallets.length === 0}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Processing…' : 'Send Money'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">Transfer Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900">
          <p>✓ Transfers are instant and irreversible</p>
          <p>✓ Both wallets must be active</p>
          <p>✓ You cannot transfer more than your available balance</p>
          <p>✓ Keep your wallet number private and share only with trusted people</p>
        </CardContent>
      </Card>

      {/* Back Button */}
      <Button asChild variant="outline" className="w-full mt-6">
        <Link href="/dashboard">← Back to Dashboard</Link>
      </Button>
    </div>
  )
}
