'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/notification-bell'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function getUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('[v0] Error getting user:', error)
      } finally {
        setLoading(false)
      }
    }

    getUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (!user) {
    return (
      <div className="text-center py-8">
        <p>Please log in to access this page</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
              <Image
                src="/logo.png"
                alt="Digital Wallet Logo"
                width={32}
                height={32}
                className="rounded"
              />
              Digital Wallet
            </Link>
            <nav className="hidden md:flex space-x-6">
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/transactions"
                className="text-gray-600 hover:text-gray-900"
              >
                Transactions
              </Link>
              <Link
                href="/dashboard/qr-codes"
                className="text-gray-600 hover:text-gray-900"
              >
                QR Codes
              </Link>
              <Link
                href="/dashboard/qr-scanner"
                className="text-gray-600 hover:text-gray-900"
              >
                Pay
              </Link>
              <Link
                href="/dashboard/complaints"
                className="text-gray-600 hover:text-gray-900"
              >
                Complaints
              </Link>
            </nav>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">
                  {user.email}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
