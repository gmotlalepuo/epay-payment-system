'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatTimestamp, ListPagination, ListToolbar, usePagedItems } from '@/components/list-tools'

interface AdminStats {
  totalUsers: number
  totalTransactions: number
  totalRevenue: number
  pendingComplaints: number
}

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  status: string
  created_at: string
}

interface Transaction {
  id: string
  type: string
  amount: number
  status: string
  created_at: string
}

interface Complaint {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    pendingComplaints: 0,
  })
  const [users, setUsers] = useState<User[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [userSearch, setUserSearch] = useState('')
  const [userStatus, setUserStatus] = useState('all')
  const [transactionSearch, setTransactionSearch] = useState('')
  const [transactionStatus, setTransactionStatus] = useState('all')
  const [transactionType, setTransactionType] = useState('all')
  const [complaintSearch, setComplaintSearch] = useState('')
  const [complaintStatus, setComplaintStatus] = useState('all')
  const [complaintPriority, setComplaintPriority] = useState('all')
  const supabase = createClient()

  useEffect(() => {
    fetchAdminData()
  }, [])

  async function checkAdminAccess() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    return userData?.role === 'super_admin'
  }

  async function fetchAdminData() {
    try {
      setLoading(true)
      const isAdmin = await checkAdminAccess()

      if (!isAdmin) {
        alert('Access denied: Admin privileges required')
        window.location.href = '/dashboard'
        return
      }

      // Fetch statistics
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      const { count: transactionCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })

      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')

      const totalRevenue = transactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

      const { count: complaintCount } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'closed')

      setStats({
        totalUsers: userCount || 0,
        totalTransactions: transactionCount || 0,
        totalRevenue,
        pendingComplaints: complaintCount || 0,
      })

      // Fetch recent users
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      setUsers(usersData || [])

      // Fetch recent transactions
      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })

      setTransactions(transactionsData || [])

      // Fetch pending complaints
      const { data: complaintsData } = await supabase
        .from('complaints')
        .select('*')
        .neq('status', 'closed')
        .order('created_at', { ascending: false })

      setComplaints(complaintsData || [])
    } catch (error) {
      console.error('[v0] Error fetching admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      open: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase()
    return users.filter((user) => {
      const matchesSearch =
        !term ||
        [user.first_name, user.last_name, user.email, user.role, user.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return matchesSearch && (userStatus === 'all' || user.status === userStatus)
    })
  }, [users, userSearch, userStatus])

  const filteredTransactions = useMemo(() => {
    const term = transactionSearch.trim().toLowerCase()
    return transactions.filter((tx) => {
      const matchesSearch =
        !term ||
        [tx.type, tx.status, String(tx.amount)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return (
        matchesSearch &&
        (transactionStatus === 'all' || tx.status === transactionStatus) &&
        (transactionType === 'all' || tx.type === transactionType)
      )
    })
  }, [transactions, transactionSearch, transactionStatus, transactionType])

  const filteredComplaints = useMemo(() => {
    const term = complaintSearch.trim().toLowerCase()
    return complaints.filter((complaint) => {
      const matchesSearch =
        !term ||
        [complaint.title, complaint.status, complaint.priority]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      return (
        matchesSearch &&
        (complaintStatus === 'all' || complaint.status === complaintStatus) &&
        (complaintPriority === 'all' || complaint.priority === complaintPriority)
      )
    })
  }, [complaints, complaintSearch, complaintStatus, complaintPriority])

  const usersPage = usePagedItems(filteredUsers, 10, `${userSearch}|${userStatus}`)
  const transactionsPage = usePagedItems(
    filteredTransactions,
    10,
    `${transactionSearch}|${transactionStatus}|${transactionType}`,
  )
  const complaintsPage = usePagedItems(
    filteredComplaints,
    8,
    `${complaintSearch}|${complaintStatus}|${complaintPriority}`,
  )

  if (loading) {
    return <div className="rounded-xl border bg-card py-16 text-center text-sm font-medium text-muted-foreground">Loading administration workspace...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Control centre</p>
        <h1 className="mt-1 text-3xl font-bold">Admin dashboard</h1>
        <p className="mt-2 text-muted-foreground">Platform overview and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              P{stats.totalRevenue.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Pending Complaints
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingComplaints}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="overflow-x-auto rounded-xl border bg-card p-1.5 shadow-xs">
        <div className="flex min-w-max gap-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
              activeTab === 'overview'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
              activeTab === 'users'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
              activeTab === 'transactions'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab('complaints')}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${
              activeTab === 'complaints'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Complaints
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-sm text-gray-600">{user.email}</p>
                      <p className="text-xs text-gray-500">Joined {formatTimestamp(user.created_at)}</p>
                    </div>
                    <Badge className={getStatusColor(user.status)}>
                      {user.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending Complaints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {complaints.length === 0 ? (
                  <p className="text-gray-600">No pending complaints</p>
                ) : (
                  complaints.slice(0, 5).map((complaint) => (
                    <div key={complaint.id} className="border-b pb-3">
                      <p className="font-medium">{complaint.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Submitted {formatTimestamp(complaint.created_at)}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge className={getStatusColor(complaint.status)}>
                          {complaint.status}
                        </Badge>
                        <Badge className={getStatusColor(complaint.priority)}>
                          {complaint.priority}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'users' && (
        <Card>
          <CardHeader>
            <CardTitle>Users Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <ListToolbar
                search={userSearch}
                onSearchChange={setUserSearch}
                searchPlaceholder="Search users"
                filters={[
                  {
                    label: 'Status',
                    value: userStatus,
                    onChange: setUserStatus,
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Name</th>
                    <th className="text-left py-2 px-2">Email</th>
                    <th className="text-left py-2 px-2">Role</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {usersPage.pagedItems.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="py-2 px-2">{user.email}</td>
                      <td className="py-2 px-2 capitalize">{user.role}</td>
                      <td className="py-2 px-2">
                        <Badge className={getStatusColor(user.status)}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        {formatTimestamp(user.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">No users match your search or filters.</p>
            ) : (
              <ListPagination
                page={usersPage.page}
                totalPages={usersPage.totalPages}
                totalItems={filteredUsers.length}
                onPageChange={usersPage.setPage}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'transactions' && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <ListToolbar
                search={transactionSearch}
                onSearchChange={setTransactionSearch}
                searchPlaceholder="Search transactions"
                filters={[
                  {
                    label: 'Type',
                    value: transactionType,
                    onChange: setTransactionType,
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
                    value: transactionStatus,
                    onChange: setTransactionStatus,
                    options: [
                      { label: 'All', value: 'all' },
                      { label: 'Completed', value: 'completed' },
                      { label: 'Pending', value: 'pending' },
                      { label: 'Processing', value: 'processing' },
                      { label: 'Failed', value: 'failed' },
                    ],
                  },
                ]}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-2">Type</th>
                    <th className="text-left py-2 px-2">Amount</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactionsPage.pagedItems.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2 capitalize">{tx.type}</td>
                      <td className="py-2 px-2">P{tx.amount.toFixed(2)}</td>
                      <td className="py-2 px-2">
                        <Badge className={getStatusColor(tx.status)}>
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        {formatTimestamp(tx.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">
                No transactions match your search or filters.
              </p>
            ) : (
              <ListPagination
                page={transactionsPage.page}
                totalPages={transactionsPage.totalPages}
                totalItems={filteredTransactions.length}
                onPageChange={transactionsPage.setPage}
              />
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'complaints' && (
        <Card>
          <CardHeader>
            <CardTitle>Complaint Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <ListToolbar
                search={complaintSearch}
                onSearchChange={setComplaintSearch}
                searchPlaceholder="Search complaints"
                filters={[
                  {
                    label: 'Status',
                    value: complaintStatus,
                    onChange: setComplaintStatus,
                    options: [
                      { label: 'All', value: 'all' },
                      { label: 'Open', value: 'open' },
                      { label: 'In progress', value: 'in_progress' },
                      { label: 'Resolved', value: 'resolved' },
                      { label: 'Closed', value: 'closed' },
                      { label: 'Rejected', value: 'rejected' },
                    ],
                  },
                  {
                    label: 'Priority',
                    value: complaintPriority,
                    onChange: setComplaintPriority,
                    options: [
                      { label: 'All', value: 'all' },
                      { label: 'Low', value: 'low' },
                      { label: 'Medium', value: 'medium' },
                      { label: 'High', value: 'high' },
                      { label: 'Urgent', value: 'urgent' },
                    ],
                  },
                ]}
              />
            </div>
            <div className="space-y-4">
              {complaints.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No complaints</p>
              ) : filteredComplaints.length === 0 ? (
                <p className="text-gray-600 text-center py-8">
                  No complaints match your search or filters.
                </p>
              ) : (
                complaintsPage.pagedItems.map((complaint) => (
                  <div
                    key={complaint.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{complaint.title}</h3>
                        <p className="text-sm text-gray-600">
                          Submitted {formatTimestamp(complaint.created_at)}
                        </p>
                      </div>
                      <div className="space-x-2">
                        <Badge className={getStatusColor(complaint.status)}>
                          {complaint.status}
                        </Badge>
                        <Badge className={getStatusColor(complaint.priority)}>
                          {complaint.priority}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                ))
              )}
              {filteredComplaints.length > 0 && (
                <ListPagination
                  page={complaintsPage.page}
                  totalPages={complaintsPage.totalPages}
                  totalItems={filteredComplaints.length}
                  pageSize={8}
                  onPageChange={complaintsPage.setPage}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
