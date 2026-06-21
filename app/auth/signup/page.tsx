'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/theme-toggle'
import { AuthShowcase } from '@/components/auth-showcase'
import { BrandLogo } from '@/components/brand-logo'

export default function Page() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!email.trim() || !password || !repeatPassword) {
      setError('Please fill in all required fields')
      setIsLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Signup failed')
      }

      toast.success('Account created', {
        description: 'Check your email to confirm your account.',
      })
      router.push('/auth/signup-success')
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'An error occurred'
      setError(msg)
      toast.error('Sign-up failed', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/" aria-label="BotsPay home"><BrandLogo priority className="h-10 w-32" /></Link>
          <div className="flex items-center gap-2"><ThemeToggle /><Link href="/auth/login" className="font-semibold hover:text-foreground">Login</Link></div>
        </div>
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center xl:gap-16">
          <AuthShowcase mode="signup" />

          <div className="relative rounded-3xl border bg-card/90 p-6 shadow-[0_35px_120px_-35px_rgba(15,23,42,0.3)] backdrop-blur-2xl sm:p-8">
            <div className="absolute -right-12 top-8 h-32 w-32 rounded-full bg-slate-300/15 blur-3xl" />
            <div className="absolute left-6 bottom-10 h-24 w-24 rounded-full bg-slate-500/10 blur-3xl" />
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Create account</p>
                <h2 className="text-2xl font-semibold text-foreground">Fast, secure signup</h2>
              </div>
              <form onSubmit={handleSignUp} className="space-y-5">
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

                <div className="grid gap-2 sm:grid-cols-2">
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
                  <div className="grid gap-2">
                    <Label htmlFor="repeat-password">Repeat password</Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <Button type="submit" className="w-full rounded-full px-5 py-3 text-sm font-semibold" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Creating an account…' : 'Sign up'}
                </Button>
              </form>
              <div className="rounded-3xl border bg-muted/60 p-4 text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link href="/auth/login" className="font-semibold text-foreground hover:text-primary">
                  Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
