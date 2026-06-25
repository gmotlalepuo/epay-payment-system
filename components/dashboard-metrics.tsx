'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch } from '@/lib/api-client'

interface Wallet {
  id: string
  daily_limit: number
  daily_spent: number
  balance: number
}

interface Transaction {
  id: string
  type: string
  amount: number | string
  status: string
  from_wallet_id: string | null
  to_wallet_id: string | null
  created_at: string
}

interface QrCode {
  id: string
  description: string
  amount: number | string
  paid_count: number
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function fmtCurrency(n: number) {
  return `P${n.toFixed(2)}`
}

const TYPE_COLORS: Record<string, string> = {
  topup: '#10b981',
  transfer: '#3b82f6',
  payment: '#8b5cf6',
  refund: '#f59e0b',
  adjustment: '#6b7280',
}

export function DashboardMetrics() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [w, t, q] = await Promise.all([
          apiFetch('/api/wallets').then((r) => (r.ok ? r.json() : { wallets: [] })),
          apiFetch('/api/transfers').then((r) => (r.ok ? r.json() : { transactions: [] })),
          apiFetch('/api/qr-codes').then((r) => (r.ok ? r.json() : { qrCodes: [] })),
        ])
        setWallets(w.wallets ?? [])
        setTransactions(t.transactions ?? [])
        setQrCodes(q.qrCodes ?? [])
      } catch (e) {
        console.error('Error loading metrics:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const walletIds = useMemo(() => new Set(wallets.map((w) => w.id)), [wallets])

  // ── Direction helpers ──────────────────────────────────────────
  function isInflow(t: Transaction) {
    return t.to_wallet_id != null && walletIds.has(t.to_wallet_id)
  }
  function isOutflow(t: Transaction) {
    return t.from_wallet_id != null && walletIds.has(t.from_wallet_id)
  }
  function amt(t: Transaction) {
    return Number(t.amount)
  }

  // ── This-month KPIs ────────────────────────────────────────────
  const mom = useMemo(() => {
    const since = monthStart()
    let received = 0
    let spent = 0
    let count = 0
    for (const t of transactions) {
      if (t.status !== 'completed') continue
      const d = new Date(t.created_at)
      if (d < since) continue
      count++
      if (isInflow(t)) received += amt(t)
      else if (isOutflow(t)) spent += amt(t)
    }
    return { received, spent, net: received - spent, count }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, walletIds])

  // ── 30-day flow series ─────────────────────────────────────────
  const flowData = useMemo(() => {
    const buckets = new Map<string, { day: string; in: number; out: number }>()
    const today = startOfDay(new Date())
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets.set(key, {
        day: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        in: 0,
        out: 0,
      })
    }
    for (const t of transactions) {
      if (t.status !== 'completed') continue
      const d = startOfDay(new Date(t.created_at))
      const key = d.toISOString().slice(0, 10)
      const b = buckets.get(key)
      if (!b) continue
      if (isInflow(t)) b.in += amt(t)
      else if (isOutflow(t)) b.out += amt(t)
    }
    return Array.from(buckets.values())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, walletIds])

  // ── Transaction mix (by count) ─────────────────────────────────
  const mixData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (t.status !== 'completed') continue
      counts.set(t.type, (counts.get(t.type) ?? 0) + 1)
    }
    return Array.from(counts, ([type, value]) => ({
      type,
      value,
      fill: TYPE_COLORS[type] ?? '#6b7280',
    }))
  }, [transactions])

  // ── Top QR codes by paid_count ─────────────────────────────────
  const topQr = useMemo(() => {
    return [...qrCodes]
      .filter((q) => q.paid_count > 0)
      .sort((a, b) => b.paid_count - a.paid_count)
      .slice(0, 5)
      .map((q) => ({
        name: q.description.length > 22 ? q.description.slice(0, 22) + '…' : q.description,
        paid_count: q.paid_count,
        amount: Number(q.amount),
      }))
  }, [qrCodes])

  // ── Daily limit ────────────────────────────────────────────────
  const limit = useMemo(() => {
    const total_limit = wallets.reduce((s, w) => s + Number(w.daily_limit ?? 0), 0)
    const total_spent = wallets.reduce((s, w) => s + Number(w.daily_spent ?? 0), 0)
    const pct = total_limit > 0 ? Math.min(100, (total_spent / total_limit) * 100) : 0
    return { total_limit, total_spent, pct }
  }, [wallets])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">Loading metrics…</CardContent>
      </Card>
    )
  }

  const hasData = transactions.length > 0
  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
          <CardDescription>
            Once you make a transaction, charts and trends will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Received this month" value={fmtCurrency(mom.received)} tone="green" />
        <KpiCard label="Spent this month" value={fmtCurrency(mom.spent)} tone="red" />
        <KpiCard
          label="Net change"
          value={`${mom.net >= 0 ? '+' : ''}${fmtCurrency(mom.net)}`}
          tone={mom.net >= 0 ? 'green' : 'red'}
        />
        <KpiCard label="Transactions" value={mom.count.toString()} />
      </div>

      {/* Flow chart */}
      <Card>
        <CardHeader>
          <CardTitle>Money in vs money out</CardTitle>
          <CardDescription>Last 30 days, by day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flowData} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `P${v}`} />
                <Tooltip
                  formatter={(v: number) => fmtCurrency(v)}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="in"
                  name="In"
                  stroke="#10b981"
                  fill="url(#g-in)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="out"
                  name="Out"
                  stroke="#ef4444"
                  fill="url(#g-out)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mix donut */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction mix</CardTitle>
            <CardDescription>By count, all time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mixData}
                    dataKey="value"
                    nameKey="type"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {mixData.map((entry) => (
                      <Cell key={entry.type} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 justify-center text-xs">
              {mixData.map((m) => (
                <div key={m.type} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: m.fill }}
                  />
                  <span className="capitalize">{m.type}</span>
                  <span className="text-gray-500">({m.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top QR codes OR daily limit */}
        {topQr.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Top QR codes</CardTitle>
              <CardDescription>Most-paid items</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topQr}
                    layout="vertical"
                    margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number, k) => [v, k === 'paid_count' ? 'payments' : k]}
                    />
                    <Bar dataKey="paid_count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Daily limit usage</CardTitle>
              <CardDescription>Across all your wallets, today</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{fmtCurrency(limit.total_spent)}</span>
                <span className="text-gray-500">of {fmtCurrency(limit.total_limit)}</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    limit.pct >= 90
                      ? 'bg-red-500'
                      : limit.pct >= 70
                        ? 'bg-amber-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${limit.pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {limit.pct.toFixed(0)}% used. Resets at midnight.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'green' | 'red'
}) {
  const color =
    tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-600' : 'text-gray-900'
  return (
    <Card className="p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  )
}
