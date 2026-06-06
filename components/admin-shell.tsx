'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/notification-bell'
import { Button } from '@/components/ui/button'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 font-bold text-lg">
              <Image
                src="/logo.png"
                alt="Digital Wallet Logo"
                width={32}
                height={32}
                className="rounded"
              />
              Admin Dashboard
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  )
}
