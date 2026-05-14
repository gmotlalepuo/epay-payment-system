'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [walletIds, setWalletIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadTransactions() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/auth/login')
          return
        }

        const [walletsRes, txnRes] = await Promise.all([
          fetch('/api/wallets'),
          fetch('/api/transfers'),
        ])
        if (walletsRes.ok) {
          const wd = await walletsRes.json()
          setWalletIds(new Set((wd.wallets ?? []).map((w: any) => w.id)))
        }
        if (txnRes.ok) {
          const data = await txnRes.json()
          setTransactions(data.transactions || [])
        }
      } catch (error) {
        console.error('Error loading transactions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTransactions()
  }, [router, supabase])

  function direction(t: any): 'out' | 'in' | 'neutral' {
    if (t.from_wallet_id && walletIds.has(t.from_wallet_id)) return 'out'
    if (t.to_wallet_id && walletIds.has(t.to_wallet_id)) return 'in'
    return 'neutral'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'transfer':
        return '↔️'
      case 'payment':
        return '💳'
      case 'topup':
        return '➕'
      case 'withdrawal':
        return '➖'
      case 'refund':
        return '↩️'
      default:
        return '💰'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Loading transactions...</p>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Transaction History</h1>
            <p className="text-gray-600 mt-1">All your transactions</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>

        {/* Transactions List */}
        {transactions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-600 mb-4">No transactions yet</p>
            <Button asChild>
              <Link href="/dashboard/transfers">Make Your First Transfer</Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction) => (
              <Card
                key={transaction.id}
                className="p-6 flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-2xl">
                    {getTypeIcon(transaction.type)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold capitalize">{transaction.type}</p>
                    <p className="text-sm text-gray-600">
                      {transaction.description || `${transaction.type} transaction`}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(transaction.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    {(() => {
                      const dir = direction(transaction)
                      const sign = dir === 'out' ? '-' : dir === 'in' ? '+' : ''
                      const color =
                        dir === 'out' ? 'text-red-600' : dir === 'in' ? 'text-green-600' : ''
                      return (
                        <p className={`font-bold text-lg ${color}`}>
                          {sign}${Number(transaction.amount).toFixed(2)}
                        </p>
                      )
                    })()}
                    <p className="text-sm text-gray-600">{transaction.currency}</p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-xs font-semibold ${getStatusColor(
                      transaction.status
                    )}`}
                  >
                    {transaction.status}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
