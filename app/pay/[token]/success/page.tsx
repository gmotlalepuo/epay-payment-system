'use client'

import { useEffect, useState } from 'react'
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

export default function GuestQrPaymentSuccessPage() {
  const params = useParams<{ token: string }>()
  const searchParams = useSearchParams()
  const [qr, setQr] = useState<ResolvedQr | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Card payment successful</CardTitle>
          <CardDescription>
            Your card payment was accepted. The receiver will be credited automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading ? (
            <p className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading receipt...
            </p>
          ) : qr ? (
            <PaymentReceipt
              reference={sessionId ?? `CARD-${params.token}`}
              amount={Number(qr.amount)}
              currency={qr.currency}
              receiver={qr.receiver_name || 'Receiver'}
              description={qr.description}
              method="Visa/card"
            />
          ) : (
            <p className="text-gray-600">Your payment was accepted.</p>
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
