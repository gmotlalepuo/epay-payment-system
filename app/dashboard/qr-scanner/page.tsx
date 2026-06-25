'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseQrToken } from '@/lib/qr-token'

export default function PayByQrPage() {
  const router = useRouter()
  const [linkInput, setLinkInput] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'BarcodeDetector' in window &&
      typeof navigator?.mediaDevices?.getUserMedia === 'function'
    setCameraSupported(supported)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  async function startCamera() {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setScanning(true)
      void detectLoop()
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to access camera')
    }
  }

  async function detectLoop() {
    // @ts-expect-error BarcodeDetector is not yet in the lib.dom types in TS
    const Detector = window.BarcodeDetector
    if (!Detector) return
    const detector = new Detector({ formats: ['qr_code'] })

    const tick = async () => {
      if (!streamRef.current || !videoRef.current) return
      try {
        const codes = await detector.detect(videoRef.current)
        const value = codes?.[0]?.rawValue
        if (value) {
          const token = parseQrToken(value)
          if (token) {
            stopCamera()
            router.push(`/pay/${token}`)
            return
          }
        }
      } catch {
        // Ignore single-frame scanner failures and keep scanning.
      }
      setTimeout(tick, 200)
    }
    void tick()
  }

  function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasteError(null)
    const token = parseQrToken(linkInput)
    if (!token) {
      setPasteError("Couldn't read a payment link or token. Paste /pay/token, /qr/pay?token=abc, a full URL, or a token.")
      return
    }
    router.push(`/pay/${token}`)
  }

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Pay by QR</h1>
        <p className="mt-2 text-muted-foreground">
          Scan with your camera, or paste a payment link if scanning is not available.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Paste a payment link</CardTitle>
            <CardDescription>Works with /pay/token, /qr/pay?token=abc, full URLs, or a bare token.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link">Payment link or token</Label>
                <Input
                  id="link"
                  placeholder="https://your-app.com/pay/ABCD1234"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  autoComplete="off"
                />
              </div>
              {pasteError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {pasteError}
                </div>
              )}
              <Button type="submit" className="w-full">
                Continue to payment
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scan with camera</CardTitle>
            <CardDescription>
              {cameraSupported === false
                ? 'Your browser does not support QR scanning. Use the paste box above instead.'
                : 'Point your camera at a QR code.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cameraSupported === false ? (
              <p className="text-sm text-muted-foreground">
                On a phone, the camera app can usually recognise the QR code and open the link directly.
              </p>
            ) : (
              <>
                <div className="relative aspect-video overflow-hidden rounded-md bg-black">
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  {!scanning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
                      Camera off
                    </div>
                  )}
                </div>
                {cameraError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {cameraError}
                  </div>
                )}
                {!scanning ? (
                  <Button type="button" onClick={startCamera} className="w-full">
                    Start camera
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={stopCamera} className="w-full">
                    Stop camera
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
