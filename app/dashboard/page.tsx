'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import { DashboardMetrics } from '@/components/dashboard-metrics'
import { ListPagination, ListToolbar, usePagedItems } from '@/components/list-tools'
import { ArrowLeftRight, Bell, CircleHelp, CreditCard, Lightbulb, QrCode, ScanLine, Settings, WalletCards } from 'lucide-react'

export default function DashboardHome() {
  const [user, setUser] = useState<any>(null)
  const [wallets, setWallets] = useState<any[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [loading, setLoading] = useState(true)
  const [walletSearch, setWalletSearch] = useState('')
  const [walletStatus, setWalletStatus] = useState('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadDashboard() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser()

        if (!authUser) {
          router.push('/auth/login')
          return
        }

        setUser(authUser)

        // Fetch wallets
        const response = await fetch('/api/wallets')
        if (response.ok) {
          const data = await response.json()
          setWallets(data.wallets || [])

          // Calculate total balance
          const total = data.wallets.reduce(
            (sum: number, wallet: any) => sum + wallet.balance,
            0
          )
          setTotalBalance(total)
        }
      } catch (error) {
        console.error('Error loading dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [router, supabase])

  const filteredWallets = useMemo(() => {
    const term = walletSearch.trim().toLowerCase()
    return wallets.filter((wallet) => {
      const matchesSearch =
        !term ||
        [wallet.name, wallet.wallet_number, wallet.currency, wallet.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return matchesSearch && (walletStatus === 'all' || wallet.status === walletStatus)
    })
  }, [wallets, walletSearch, walletStatus])

  const walletPage = usePagedItems(filteredWallets, 6, `${walletSearch}|${walletStatus}`)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Account overview</p>
            <h1 className="mt-1 text-3xl font-bold">Welcome back</h1>
            <p className="mt-1 text-muted-foreground">
              Welcome back, {user?.email}
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/settings">Settings</Link>
          </Button>
        </div>

        {/* Total Balance Card */}
        <Card className="relative mb-8 overflow-hidden border-0 bg-slate-950 p-7 text-white shadow-xl shadow-slate-950/10">
          <div className="absolute -right-12 -top-16 size-52 rounded-full bg-primary/20 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div><p className="text-sm font-medium text-slate-300">Total available balance</p><h2 className="mt-2 text-4xl font-bold tabular-nums sm:text-5xl">P{totalBalance.toFixed(2)}</h2><p className="mt-5 text-sm text-slate-400">Across {wallets.length} wallet{wallets.length === 1 ? '' : 's'}</p></div>
            <span className="grid size-12 place-items-center rounded-xl bg-sky-400/15 text-sky-300"><WalletCards /></span>
          </div>
        </Card>

        {/* Wallets Section */}
        {wallets.length > 0 && (
          <div className="mb-4">
            <ListToolbar
              search={walletSearch}
              onSearchChange={setWalletSearch}
              searchPlaceholder="Search wallets"
              filters={[
                {
                  label: 'Status',
                  value: walletStatus,
                  onChange: setWalletStatus,
                  options: [
                    { label: 'All', value: 'all' },
                    { label: 'Active', value: 'active' },
                    { label: 'Inactive', value: 'inactive' },
                    { label: 'Suspended', value: 'suspended' },
                  ],
                },
              ]}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {walletPage.pagedItems.map((wallet) => (
            <Card key={wallet.id} className="p-6 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/wallets/${wallet.id}`}
                    className="font-semibold truncate hover:underline block"
                  >
                    {wallet.name || 'Unnamed wallet'}
                  </Link>
                  <p className="font-mono text-xs text-gray-500 mt-1 truncate">
                    {wallet.wallet_number}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-medium">
                  {wallet.status}
                </span>
              </div>
              <p className="text-2xl font-bold mt-4">P{wallet.balance.toFixed(2)}</p>
              <p className="text-xs text-gray-600 mt-2">{wallet.currency}</p>
              <div className="mt-4 flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/dashboard/wallets/${wallet.id}`}>Details</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href={`/dashboard/transfers?from=${wallet.id}`}>Transfer</Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {wallets.length > 0 && filteredWallets.length === 0 && (
          <Card className="p-8 text-center mb-8">
            <p className="text-gray-600">No wallets match your search or filters.</p>
          </Card>
        )}

        {filteredWallets.length > 0 && (
          <div className="mb-8">
            <ListPagination
              page={walletPage.page}
              totalPages={walletPage.totalPages}
              totalItems={filteredWallets.length}
              pageSize={6}
              onPageChange={walletPage.setPage}
            />
          </div>
        )}

        {/* Create Wallet Button */}
        {wallets.length === 0 && (
          <Card className="p-8 text-center mb-8">
            <p className="text-gray-600 mb-4">You haven&apos;t created any wallets yet.</p>
            <Button asChild size="lg">
              <Link href="/dashboard/create-wallet">Create Your First Wallet</Link>
            </Button>
          </Card>
        )}

        {wallets.length > 0 && (
          <div className="mb-8">
            <Button asChild variant="outline">
              <Link href="/dashboard/create-wallet">Create New Wallet</Link>
            </Button>
          </div>
        )}

        {/* Insights & metrics */}
        {wallets.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Insights</h2>
            <DashboardMetrics />
          </div>
        )}

        {/* Quick Actions Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Available Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Top Up */}
            <Card className="p-6 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-5" /></div>
              <h3 className="font-bold mb-2">Top up wallet</h3>
              <p className="text-sm text-gray-600 mb-4">Add funds with a card via Stripe</p>
              <Button asChild className="w-full">
                <Link href="/dashboard/topup">Top up</Link>
              </Button>
            </Card>

            {/* Send Money */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><ArrowLeftRight className="size-5" /></div>
              <h3 className="font-bold mb-2">Send Money</h3>
              <p className="text-sm text-gray-600 mb-4">Transfer funds instantly to other wallets</p>
              <Button asChild className="w-full">
                <Link href="/dashboard/transfers">New Transfer</Link>
              </Button>
            </Card>

            {/* View Transactions */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><WalletCards className="size-5" /></div>
              <h3 className="font-bold mb-2">Transaction History</h3>
              <p className="text-sm text-gray-600 mb-4">View all your past and pending transactions</p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/dashboard/transactions">View History</Link>
              </Button>
            </Card>

            {/* Pay by QR */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><ScanLine className="size-5" /></div>
              <h3 className="font-bold mb-2">Pay by QR</h3>
              <p className="text-sm text-gray-600 mb-4">Scan or paste a payment link to pay</p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/dashboard/qr-scanner">Pay by QR</Link>
              </Button>
            </Card>

            {/* Receive via QR */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><QrCode className="size-5" /></div>
              <h3 className="font-bold mb-2">Receive via QR</h3>
              <p className="text-sm text-gray-600 mb-4">Generate a QR code for an item or service</p>
              <Button asChild className="w-full">
                <Link href="/dashboard/qr-codes/new">New QR code</Link>
              </Button>
            </Card>

            {/* Complaints */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary"><CircleHelp className="size-5" /></div>
              <h3 className="font-bold mb-2">File Complaint</h3>
              <p className="text-sm text-gray-600 mb-4">Report issues or disputes with transactions</p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/dashboard/complaints">View Complaints</Link>
              </Button>
            </Card>

            {/* Notifications */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary"><Bell className="size-5" /></div>
              <h3 className="font-bold mb-2">Notifications</h3>
              <p className="text-sm text-gray-600 mb-4">Stay updated with transaction alerts</p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/dashboard/settings">Notification Settings</Link>
              </Button>
            </Card>

            {/* Settings */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="mb-3 grid size-10 place-items-center rounded-xl bg-secondary/10 text-secondary"><Settings className="size-5" /></div>
              <h3 className="font-bold mb-2">Account Settings</h3>
              <p className="text-sm text-gray-600 mb-4">Manage profile and preferences</p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/dashboard/settings">Go to Settings</Link>
              </Button>
            </Card>
          </div>
        </div>


        {/* Info Section */}
        <Card className="border-primary/20 bg-primary/5 p-6">
          <h3 className="mb-3 flex items-center gap-2 font-bold text-foreground"><Lightbulb className="size-5 text-primary" />Quick tip</h3>
          <p className="text-sm text-muted-foreground">
            Create multiple wallets for different purposes. Use your wallet number to receive transfers from others.
          </p>
        </Card>
    </div>
  )
}
