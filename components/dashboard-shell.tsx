'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeftRight, Bell, ChevronDown, CircleHelp, CreditCard, Grid2X2, LayoutDashboard, LogOut, Menu, PlusCircle, QrCode, ScanLine, Settings, UserRound, WalletCards, X } from 'lucide-react'
import { useState } from 'react'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand-logo'

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Transactions', href: '/dashboard/transactions', icon: CreditCard },
  { label: 'QR codes', href: '/dashboard/qr-codes', icon: QrCode },
]

const services = [
  { label: 'Create wallet', detail: 'Open a new wallet', href: '/dashboard/create-wallet', icon: PlusCircle },
  { label: 'My wallets', detail: 'Balances and wallet details', href: '/dashboard', icon: WalletCards },
  { label: 'Top up', detail: 'Add funds by card', href: '/dashboard/topup', icon: CreditCard },
  { label: 'Send money', detail: 'Transfer between wallets', href: '/dashboard/transfers', icon: ArrowLeftRight },
  { label: 'Transactions', detail: 'Review payment activity', href: '/dashboard/transactions', icon: LayoutDashboard },
  { label: 'Create QR code', detail: 'Receive a QR payment', href: '/dashboard/qr-codes/new', icon: QrCode },
  { label: 'Scan and pay', detail: 'Make a QR payment', href: '/dashboard/qr-scanner', icon: ScanLine },
  { label: 'Notifications', detail: 'Account and payment alerts', href: '/dashboard/notifications', icon: Bell },
  { label: 'Support', detail: 'Complaints and assistance', href: '/dashboard/complaints', icon: CircleHelp },
]

function Navigation({ pathname, mobile, onNavigate }: { pathname: string; mobile?: boolean; onNavigate?: () => void }) {
  return (
    <nav className={cn(mobile ? 'grid gap-1 p-3' : 'hidden items-center gap-1 lg:flex')} aria-label="Main navigation">
      {navigation.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground', active && 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20')}><item.icon className="size-4" strokeWidth={active ? 2.25 : 1.8} />{item.label}</Link>
      })}
      <ServicesMenu mobile={mobile} />
      <Link href="/dashboard/complaints" onClick={onNavigate} aria-current={pathname.startsWith('/dashboard/complaints') ? 'page' : undefined} className={cn('flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground', pathname.startsWith('/dashboard/complaints') && 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20')}><CircleHelp className="size-4" />Complaints</Link>
    </nav>
  )
}

function ServicesMenu({ mobile }: { mobile?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn('min-h-10 shrink-0 justify-start whitespace-nowrap rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground', mobile && 'w-full')}>
          <Grid2X2 className="size-4 text-primary" /><span>Services</span><ChevronDown className="ml-auto size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mobile ? 'start' : 'end'} className="w-[min(22rem,calc(100vw-2rem))] p-2">
        <DropdownMenuLabel className="px-2 py-2"><span className="block text-sm font-semibold">Quick access</span><span className="block text-xs font-normal text-muted-foreground">All customer services in one place</span></DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid gap-1 sm:grid-cols-2">
          {services.map((service) => <DropdownMenuItem key={service.href} asChild className="h-auto items-start gap-3 rounded-lg p-3"><Link href={service.href}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><service.icon className="size-[18px]" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{service.label}</span><span className="block text-xs leading-5 text-muted-foreground">{service.detail}</span></span></Link></DropdownMenuItem>)}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-lg"><Link href="/dashboard/settings"><Settings />Account settings</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DashboardShell({ children, email, onLogout }: { children: React.ReactNode; email: string; onLogout: () => void | Promise<void> }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const initials = email.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/85 shadow-sm shadow-black/5 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="mr-auto flex items-center gap-3 text-foreground lg:mr-4">
            <BrandLogo priority className="h-10 w-32" />
            <span className="hidden xl:block"><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Secure digital payments</span></span>
          </Link>
          <Navigation pathname={pathname} />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-2 rounded-xl px-2"><Avatar className="size-8 border border-primary/25"><AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{initials}</AvatarFallback></Avatar><span className="hidden max-w-32 truncate text-sm xl:block">{email}</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64"><DropdownMenuLabel><span className="block text-xs font-normal text-muted-foreground">Signed in as</span><span className="block truncate">{email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/dashboard/settings"><Settings />Settings</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard"><UserRound />Account overview</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={(event) => { event.preventDefault(); setConfirmLogout(true) }} className="text-destructive focus:text-destructive"><LogOut />Sign out</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}>{mobileOpen ? <X /> : <Menu />}</Button>
          </div>
        </div>
        {mobileOpen && <div className="animate-in border-t bg-background/95 duration-200 slide-in-from-top-2 lg:hidden"><Navigation pathname={pathname} mobile onNavigate={() => setMobileOpen(false)} /></div>}
      </header>
      <main id="main-content" className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8"><div key={pathname} className="page-enter">{children}</div></main>
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again before using wallet, transfer, QR, top-up, settings, or profile pages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction onClick={onLogout}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
