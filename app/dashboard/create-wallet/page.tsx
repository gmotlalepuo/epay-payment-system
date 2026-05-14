'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CreateWalletPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, currency }),
      })

      if (response.ok) {
        const data = await response.json()
        const num = data.wallet?.wallet_number ?? ''
        setSuccess(`Wallet created successfully! Number: ${num}`)
        toast.success('Wallet created', {
          description: num ? `Wallet number: ${num}` : 'You can rename it any time.',
        })
        setTimeout(() => router.push('/dashboard'), 1500)
      } else {
        const data = await response.json()
        const msg = data.error || 'Failed to create wallet'
        setError(msg)
        toast.error('Could not create wallet', { description: msg })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An error occurred'
      setError(msg)
      toast.error('Could not create wallet', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create a Wallet</h1>
        <p className="text-gray-600 mt-2">Start managing your digital money today</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Wallet</CardTitle>
          <CardDescription>Create a new wallet to start sending and receiving money</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateWallet} className="space-y-6">
            {/* Wallet Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Wallet name (optional)</Label>
              <Input
                id="name"
                placeholder="e.g. Personal, Business, Savings"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <p className="text-xs text-gray-500">
                A personal label so you can tell wallets apart. You can rename it any time.
              </p>
            </div>

            {/* Currency Selection */}
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="ZAR">ZAR - South African Rand</option>
                <option value="BWP">BWP - Botswana Pula</option>
              </select>
              <p className="text-xs text-gray-500">
                You can create multiple wallets in different currencies.
              </p>
            </div>

            {/* Benefits */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-blue-900">Your wallet will have:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li>✓ Unique wallet number for receiving transfers</li>
                <li>✓ Daily spending limit: $10,000</li>
                <li>✓ Monthly spending limit: $100,000</li>
                <li>✓ Instant balance updates</li>
                <li>✓ Transaction history</li>
              </ul>
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Creating wallet…' : 'Create Wallet'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm">Can I have multiple wallets?</h4>
            <p className="text-sm text-gray-600">Yes, you can create multiple wallets in different currencies.</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm">How do I share my wallet number?</h4>
            <p className="text-sm text-gray-600">Share your wallet number with trusted people only. It&apos;s similar to a bank account number.</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm">Are there any fees?</h4>
            <p className="text-sm text-gray-600">No fees for wallet creation or transfers between wallets.</p>
          </div>
          <div>
            <h4 className="font-semibold text-sm">Is my wallet secure?</h4>
            <p className="text-sm text-gray-600">Yes, your wallet is protected with bank-level encryption and security protocols.</p>
          </div>
        </CardContent>
      </Card>

      {/* Back Button */}
      <Button asChild variant="outline" className="w-full mt-6">
        <Link href="/dashboard">← Back to Dashboard</Link>
      </Button>
    </div>
  )
}
