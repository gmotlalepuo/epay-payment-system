'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { PaymentReceipt } from '@/components/payment-receipt'

interface ResolvedQr {
  description: string
  amount: number
  currency: string
  receiver_name: string
}

interface ReconcileResult {
  credited: boolean
  already_credited?: boolean
  amount?: number
  currency?: string
  reference_id?: string
  description?: string
  reason?: string
  error?: string
}

export default function GuestQrPaymentSuccessPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const [qr, setQr] = useState<ResolvedQr | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconcileState, setReconcileState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null)
  const [reconcileError, setReconcileError] = useState<string | null>(null)
  const ranReconcileRef = useRef(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch(`/api/qr-codes/resolve/${params.token}`)
        if (!res.ok) return
        const data = await res.json()
        if (alive) setQr(data.qr)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [params.token])

  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (!sessionId || ranReconcileRef.current) return
    ranReconcileRef.current = true
    setReconcileState('loading')

    async function reconcile() {
      try {
        const res = await fetch('/api/qr-codes/reconcile-card-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = (await res.json()) as ReconcileResult
        if (!res.ok) {
          setReconcileError(data.error ?? `HTTP ${res.status}`)
          setReconcileState('error')
          return
        }
        setReconcileResult(data)
        setReconcileState('done')
      } catch (err) {
        setReconcileError(err instanceof Error ? err.message : 'Network error')
        setReconcileState('error')
      }
    }

    void reconcile()
  }, [sessionId])

  const receiptAmount = reconcileResult?.amount ?? Number(qr?.amount ?? 0)
  const receiptCurrency = reconcileResult?.currency ?? qr?.currency ?? 'USD'
  const receiptDescription = qr?.description ?? reconcileResult?.description ?? 'Guest card QR payment'
  const receiptReference = reconcileResult?.reference_id ?? sessionId ?? `CARD-${params.token}`

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {reconcileState === 'loading' ? 'Crediting receiver...' : 'Card payment successful'}
          </CardTitle>
          <CardDescription>
            {reconcileState === 'error'
              ? 'Your card was accepted, but the wallet credit could not be verified automatically.'
              : reconcileResult?.already_credited
                ? 'This payment was already applied to the receiver wallet.'
                : reconcileResult?.credited
                  ? 'The receiver wallet has been credited.'
                  : 'Your card payment was accepted. The receiver will be credited automatically.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading || reconcileState === 'loading' ? (
            <p className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Confirming receipt...
            </p>
          ) : qr || reconcileResult?.amount ? (
            <PaymentReceipt
              reference={receiptReference}
              amount={receiptAmount}
              currency={receiptCurrency}
              receiver={qr?.receiver_name || 'Receiver'}
              description={receiptDescription}
              method="Visa/card"
            />
          ) : (
            <p className="text-gray-600">Your payment was accepted.</p>
          )}

          {reconcileState === 'done' && reconcileResult?.reason && (
            <p className="text-xs text-amber-700">{reconcileResult.reason}</p>
          )}

          {reconcileState === 'error' && (
            <p className="text-xs text-red-600">{reconcileError ?? 'Could not verify wallet credit.'}</p>
          )}

          {sessionId && (
            <p className="break-all text-xs text-gray-500">Stripe session: {sessionId}</p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button asChild variant="outline">
              <Link href={`/pay/${params.token}`}>Back</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
