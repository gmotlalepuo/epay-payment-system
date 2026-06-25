'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatTimestamp, ListPagination, ListToolbar, usePagedItems } from '@/components/list-tools'
import { apiFetch } from '@/lib/api-client'

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [walletIds, setWalletIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
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
          apiFetch('/api/wallets'),
          apiFetch('/api/transfers'),
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

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase()

    return transactions.filter((transaction) => {
      const dir = direction(transaction)
      const matchesSearch =
        !term ||
        [
          transaction.type,
          transaction.status,
          transaction.description,
          transaction.reference_id,
          transaction.currency,
          transaction.source_label,
          transaction.sender_label,
          transaction.receiver_label,
          transaction.counterparty_label,
          String(transaction.amount),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return (
        matchesSearch &&
        (typeFilter === 'all' || transaction.type === typeFilter) &&
        (statusFilter === 'all' || transaction.status === statusFilter) &&
        (directionFilter === 'all' || dir === directionFilter)
      )
    })
  }, [transactions, search, typeFilter, statusFilter, directionFilter, walletIds])

  const { page, setPage, totalPages, pagedItems } = usePagedItems(
    filteredTransactions,
    10,
    `${search}|${typeFilter}|${statusFilter}|${directionFilter}`,
  )

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
        <div className="flex flex-col gap-4 mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Transaction History</h1>
            <p className="text-gray-600 mt-1">All your payments, transfers, and top-ups</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>

        <div className="mb-4">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search transactions"
            filters={[
              {
                label: 'Type',
                value: typeFilter,
                onChange: setTypeFilter,
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Transfers', value: 'transfer' },
                  { label: 'Payments', value: 'payment' },
                  { label: 'Top-ups', value: 'topup' },
                  { label: 'Refunds', value: 'refund' },
                ],
              },
              {
                label: 'Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Completed', value: 'completed' },
                  { label: 'Pending', value: 'pending' },
                  { label: 'Processing', value: 'processing' },
                  { label: 'Failed', value: 'failed' },
                ],
              },
              {
                label: 'Direction',
                value: directionFilter,
                onChange: setDirectionFilter,
                options: [
                  { label: 'All', value: 'all' },
                  { label: 'Money in', value: 'in' },
                  { label: 'Money out', value: 'out' },
                ],
              },
            ]}
          />
        </div>

        {transactions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-600 mb-4">No transactions yet</p>
            <Button asChild>
              <Link href="/dashboard/transfers">Make Your First Transfer</Link>
            </Button>
          </Card>
        ) : filteredTransactions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-600">No transactions match your search or filters.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pagedItems.map((transaction) => {
              const dir = direction(transaction)
              const sign = dir === 'out' ? '-' : dir === 'in' ? '+' : ''
              const amountColor =
                dir === 'out' ? 'text-red-600' : dir === 'in' ? 'text-green-600' : ''
              const isGuestCard = Boolean(transaction.stripe_payment_intent_id && !transaction.from_wallet_id)
              const counterpartyLabel =
                dir === 'out'
                  ? transaction.receiver_label || 'Receiver details unavailable'
                  : transaction.sender_label ||
                    (isGuestCard
                      ? 'Guest card payer'
                      : transaction.type === 'topup'
                        ? 'Card top-up'
                        : 'Sender details unavailable')
              const counterpartyPrefix =
                dir === 'out' ? 'Sent to:' : transaction.type === 'topup' ? 'Added from:' : 'From:'

              return (
                <Card
                  key={transaction.id}
                  className="p-6 flex flex-col gap-4 hover:shadow-md transition-shadow sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold uppercase text-slate-700">
                      {transaction.type?.slice(0, 2) ?? 'tx'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold capitalize">{transaction.type}</p>
                      <p className="text-sm text-gray-600 truncate">
                        {transaction.description || `${transaction.type} transaction`}
                      </p>
                      <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-2">
                        <p className="truncate">
                          <span className="font-medium text-gray-700">Source:</span>{' '}
                          {transaction.source_label || transaction.type}
                        </p>
                        <p className="truncate">
                          <span className="font-medium text-gray-700">{counterpartyPrefix}</span>{' '}
                          {counterpartyLabel}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTimestamp(transaction.completed_at ?? transaction.created_at)}
                        {transaction.reference_id && ` · ${transaction.reference_id}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6 sm:justify-end">
                    <div className="text-right">
                      <p className={`font-bold text-lg ${amountColor}`}>
                        {sign}P{Number(transaction.amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-600">{transaction.currency}</p>
                    </div>
                    <span
                      className={`px-4 py-2 rounded-full text-xs font-semibold ${getStatusColor(
                        transaction.status,
                      )}`}
                    >
                      {transaction.status}
                    </span>
                  </div>
                </Card>
              )
            })}

            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={filteredTransactions.length}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>
    </main>
  )
}
