'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, LogOut, ShieldCheck, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/brand-logo'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/85 shadow-sm shadow-black/5 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="mr-auto flex items-center gap-3 text-foreground">
            <BrandLogo priority className="h-10 w-32" />
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:block">Admin control centre</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Admin navigation">
            <Link href="/admin" className="flex min-h-10 items-center gap-2 rounded-xl bg-primary/10 px-3 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/20"><LayoutDashboard className="size-4" />Dashboard</Link>
            <Link href="/dashboard" className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><WalletCards className="size-4" />User portal</Link>
          </nav>
          <span className="hidden items-center gap-1.5 rounded-full border border-secondary/25 bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary xl:flex"><ShieldCheck className="size-3.5" />Super admin</span>
          <ThemeToggle />
          <NotificationBell />
          <Button variant="outline" size="sm" onClick={handleLogout}><LogOut />Sign out</Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8"><div className="page-enter">{children}</div></main>
    </div>
  )
}
