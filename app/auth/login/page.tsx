'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { AuthShowcase } from '@/components/auth-showcase'
import { BrandLogo } from '@/components/brand-logo'

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') ?? '/'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) throw error
      if (!data?.session || !data?.user) throw new Error('Login failed')

      toast.success('Welcome back')
      router.push(nextPath)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred'
      setError(msg)
      toast.error('Login failed', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">

      <div className="w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/" aria-label="BotsPay home"><BrandLogo priority className="h-10 w-32" /></Link>
          <div className="flex items-center gap-2"><ThemeToggle /><Link href="/auth/signup" className="font-semibold hover:text-foreground">Create account</Link></div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center xl:gap-16">
          <AuthShowcase mode="login" />

          <div className="relative rounded-3xl border bg-card/90 p-6 shadow-[0_35px_120px_-35px_rgba(15,23,42,0.3)] backdrop-blur-2xl sm:p-8">

            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Welcome back</p>
                <h2 className="text-2xl font-semibold text-foreground">Login to your wallet</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <Button type="submit" className="w-full rounded-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Logging in…' : 'Login'}
                </Button>
              </form>

              <div className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link href="/auth/signup" className="font-semibold text-foreground">
                  Sign up
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
