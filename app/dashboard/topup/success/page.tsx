'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ReconcileResult {
  credited: boolean
  already_credited?: boolean
  amount?: number
  reference_id?: string
  reason?: string
  error?: string
}

/**
 * Top-up success landing.
 *
 * The Stripe webhook is the authoritative path in production. But webhooks
 * don't reach localhost without a tunnel, so this page also calls the
 * reconcile-session endpoint to credit the wallet immediately on success.
 * Both paths are idempotent — whichever fires first wins; the other no-ops.
 */
export default function TopupSuccessPage() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')

  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (!sessionId) {
      setState('error')
      setErrorMsg('Missing session_id in URL')
      return
    }
    if (ranRef.current) return
    ranRef.current = true

    async function reconcile() {
      try {
        const res = await fetch('/api/payments/reconcile-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = (await res.json()) as ReconcileResult
        if (!res.ok) {
          setErrorMsg(data.error ?? `HTTP ${res.status}`)
          setState('error')
          return
        }
        setResult(data)
        setState('done')
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Network error')
        setState('error')
      }
    }

    void reconcile()
  }, [sessionId])

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>
            {state === 'loading' && 'Crediting your wallet…'}
            {state === 'done' && result?.credited && 'Top-up complete'}
            {state === 'done' && result?.already_credited && 'Already credited'}
            {state === 'done' && !result?.credited && !result?.already_credited && 'Payment pending'}
            {state === 'error' && 'Could not verify payment'}
          </CardTitle>
          <CardDescription>
            {state === 'loading' && 'Confirming with Stripe and updating your balance.'}
            {state === 'done' && result?.credited &&
              `P${result.amount?.toFixed(2)} has been added to your wallet.`}
            {state === 'done' && result?.already_credited &&
              'This payment was already applied to your wallet.'}
            {state === 'done' && !result?.credited && !result?.already_credited &&
              `Stripe reports the session as ${result?.reason ?? 'not yet paid'}. Refresh in a moment.`}
            {state === 'error' && (errorMsg ?? 'Unknown error')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionId && (
            <p className="text-xs text-gray-500 break-all">
              <span className="font-medium">Stripe session:</span> {sessionId}
            </p>
          )}
          {result?.reference_id && (
            <p className="text-xs text-gray-500 break-all">
              <span className="font-medium">Transaction:</span> {result.reference_id}
            </p>
          )}
          <div className="flex gap-3">
            <Button asChild className="flex-1">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/transactions">View transactions</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
