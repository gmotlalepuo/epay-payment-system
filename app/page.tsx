'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Sparkles, Users, Activity, BarChart3, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          setIsAuthenticated(true)
          router.push('/dashboard')
          return
        }
      } catch (error) {
        console.error('[v0] Auth check error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router, supabase.auth])

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 via-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-100 via-slate-50 to-slate-100">
      <nav className="sticky top-0 z-30 border-b border-white/40 bg-white/70 backdrop-blur-xl shadow-sm shadow-slate-900/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-3xl bg-linear-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <span className="text-lg font-semibold">E</span>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Epay Wallet</p>
              <h1 className="text-lg font-semibold text-slate-900">Digital finance made effortless</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" className="rounded-full px-5 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900">
                Login
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button className="rounded-full px-6 py-2.5 text-sm font-semibold">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_20%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_24%)] opacity-80" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm shadow-sky-900/5 backdrop-blur-xl">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
                Trusted payments for digital brands
              </div>
              <div className="space-y-6">
                <h2 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                  Trusted wallet tools for modern finance.
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
                  Build trust, move money faster, and stay in control with secure, reliable wallet features for everyday users.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/auth/signup" className="inline-flex w-full items-center justify-center rounded-full bg-linear-to-r from-sky-500 to-indigo-600 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:scale-[1.01] sm:w-auto">
                  Get Started
                </Link>
                <Link href="/auth/login" className="inline-flex w-full items-center justify-center rounded-full border border-slate-200 bg-white/90 px-8 py-4 text-sm font-semibold text-slate-700 transition sm:w-auto">
                  Login
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {['Secure payments', 'Easy transfers', 'Clear tracking', 'Trusted support'].map((label) => (
                  <div key={label} className="rounded-3xl border border-slate-200/80 bg-white/85 px-4 py-4 text-center shadow-sm shadow-slate-900/5">
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="hero-panel overflow-hidden p-8 shadow-2xl shadow-slate-900/10">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between rounded-3xl bg-slate-950/95 px-5 py-4 text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.8)]">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Balance</p>
                      <p className="mt-3 text-3xl font-semibold">$12,450.00</p>
                    </div>
                    <div className="rounded-3xl bg-slate-900/90 px-4 py-3 text-sm text-slate-200">
                      Active
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-[1.75rem] border border-slate-200/80 bg-white/80 p-5 shadow-sm shadow-slate-900/5">
                    {[
                      { label: 'Top ups', value: '$3.2k' },
                      { label: 'QR payments', value: '$5.4k' },
                      { label: 'Transfer volume', value: '$4.8k' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-4 rounded-3xl bg-slate-100/80 px-4 py-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                          <p className="text-xs text-slate-500">Fast, transparent data</p>
                        </div>
                        <p className="text-lg font-semibold text-slate-950">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute -right-12 top-10 h-44 w-44 rounded-full bg-slate-400/15 blur-3xl" />
              <div className="pointer-events-none absolute left-8 top-0 h-28 w-28 rounded-full bg-slate-500/10 blur-3xl" />
            </div>
          </section>

          <section className="mt-20 space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              {[
                {
                  title: 'Instant Settlements',
                  description: 'Real-time wallet transfers and QR checkout with elegant motion.',
                  icon: <Activity className="h-5 w-5 text-sky-500" />,
                },
                {
                  title: 'Secure by design',
                  description: 'End-to-end encryption, accountability, and strong fraud protection.',
                  icon: <ShieldCheck className="h-5 w-5 text-violet-500" />,
                },
                {
                  title: 'Mobile-ready',
                  description: 'Responsive layouts and touch-first UI for phone and tablet.',
                  icon: <Users className="h-5 w-5 text-cyan-500" />,
                },
              ].map((feature) => (
                <div key={feature.title} className="glass-card p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-100 text-slate-900 shadow-sm shadow-slate-900/5">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950">{feature.title}</h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-20 overflow-hidden rounded-[2.5rem] border border-white/70 bg-slate-950/95 px-6 py-16 shadow-[0_45px_140px_-60px_rgba(15,23,42,0.35)] backdrop-blur-2xl text-white sm:px-10">
            <div className="relative mx-auto max-w-7xl">
              <div className="pointer-events-none absolute inset-0 opacity-50">
                <Image
                  src="/placeholder.jpg"
                  alt="Abstract finance background"
                  fill
                  className="object-cover opacity-40"
                  priority={false}
                />
                <div className="absolute inset-0 bg-linear-to-br from-slate-950/80 via-slate-900/40 to-slate-950/90" />
              </div>

              <div className="relative space-y-8">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200 shadow-sm shadow-sky-500/10">
                    <Sparkles className="h-4 w-4" />
                    Premium membership perks
                  </div>
                  <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    What you get as a member of Epay Wallet
                  </h2>
                  <p className="max-w-3xl text-lg leading-8 text-slate-300">
                    Become a verified user and enjoy frictionless payments, trusted wallet security, clear spending insights, and a unified digital wallet experience built for modern financial lives.
                  </p>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  {[
                    {
                      title: 'Priority support',
                      detail: 'Fast help when you need it, with dedicated onboarding and customer success.',
                      icon: <Users className="h-6 w-6 text-cyan-300" />,
                    },
                    {
                      title: 'Advanced tracking',
                      detail: 'Detailed transaction insights, monthly statements, and spending alerts.',
                      icon: <BarChart3 className="h-6 w-6 text-sky-300" />,
                    },
                    {
                      title: 'Trusted protection',
                      detail: 'Multi-layer account security, fraud monitoring, and secure wallet lock.',
                      icon: <Lock className="h-6 w-6 text-violet-300" />,
                    },
                  ].map((benefit) => (
                    <div key={benefit.title} className="rounded-[1.75rem] border border-slate-200/10 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/30 backdrop-blur-xl">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900/80 text-white">
                        {benefit.icon}
                      </div>
                      <h3 className="text-xl font-semibold text-white">{benefit.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{benefit.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-6 rounded-[1.75rem] border border-slate-200/10 bg-slate-900/80 p-8 sm:grid-cols-3">
                  {[
                    { stat: '24/7', label: 'Support availability' },
                    { stat: '99.98%', label: 'Platform uptime' },
                    { stat: '500K+', label: 'Payments processed monthly' },
                  ].map((item) => (
                    <div key={item.label} className="space-y-2 text-slate-200">
                      <p className="text-3xl font-semibold">{item.stat}</p>
                      <p className="text-sm text-slate-400">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
