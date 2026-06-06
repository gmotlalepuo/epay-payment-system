'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function Page() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/'

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

      if (error) {
        throw error
      }

      if (!data || !data.session || !data.user) {
        throw new Error('Login failed')
      }

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_24%),linear-gradient(180deg,#eff6ff,#eef2ff)] flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between text-sm text-slate-700">
          <Link href="/" className="font-semibold hover:text-slate-900">Home</Link>
          <Link href="/auth/signup" className="font-semibold hover:text-slate-900">Create account</Link>
        </div>
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <span className="glass-pill">Secure sign-in</span>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Sign in to your wallet with confidence.
            </h1>
            <p className="max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
              Access your wallet quickly and securely with a clear, professional login flow.
            </p>
          </div>

          <div className="relative rounded-3xl border border-white/30 bg-white/85 p-8 shadow-[0_35px_120px_-35px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
            <div className="absolute -right-12 top-6 h-32 w-32 rounded-full bg-slate-300/15 blur-3xl" />
            <div className="absolute left-6 bottom-12 h-24 w-24 rounded-full bg-slate-500/10 blur-3xl" />
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Welcome back</p>
                <h2 className="text-2xl font-semibold text-slate-950">Login to your wallet</h2>
              </div>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
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

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {error ? (
                    <p className="text-sm text-red-500">{error}</p>
                  ) : (
                    <div />
                  )}
                  <Link href="/auth/forgot" className="text-sm font-medium text-slate-700 hover:text-slate-900">
                    Forgot password?
                  </Link>
                </div>

                <Button type="submit" className="w-full rounded-full px-5 py-3 text-sm font-semibold" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Logging in…' : 'Login'}
                </Button>
              </form>
              <div className="mt-6 rounded-3xl border border-slate-200/80 bg-slate-50/90 p-4 text-center text-sm text-slate-600">
                Don&apos;t have an account?{' '}
                <Link href="/auth/signup" className="font-semibold text-slate-950 hover:text-slate-700">
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
