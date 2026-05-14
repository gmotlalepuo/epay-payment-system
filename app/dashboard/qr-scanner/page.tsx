'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Extract a QR token from a free-form input. Accepts:
 *   - Full pay URL:  http(s)://host/pay/ABCD1234XY
 *   - Path only:     /pay/ABCD1234XY
 *   - Bare token:    ABCD1234XY
 * Returns the token or null if it can't be parsed.
 */
function parseToken(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Try as a URL first
  try {
    const url = new URL(trimmed)
    const m = url.pathname.match(/\/pay\/([A-Za-z0-9_-]+)/)
    if (m) return m[1]
  } catch {
    // not a URL — fall through
  }
  // Path-only form
  const m = trimmed.match(/(?:^|\/)pay\/([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  // Bare token: alphanumeric, reasonable length
  if (/^[A-Za-z0-9_-]{6,32}$/.test(trimmed)) return trimmed
  return null
}

export default function PayByQrPage() {
  const router = useRouter()

  // Paste-link form
  const [linkInput, setLinkInput] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  // Camera scanner
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    // BarcodeDetector is the no-deps way to scan QR in the browser. Chromium
    // (desktop + Android) supports it natively. Firefox / Safari don't, so we
    // fall back to the paste form gracefully.
    const supported =
      typeof window !== 'undefined' &&
      'BarcodeDetector' in window &&
      typeof navigator?.mediaDevices?.getUserMedia === 'function'
    setCameraSupported(supported)
  }, [])

  useEffect(() => {
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
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
          const token = parseToken(value)
          if (token) {
            stopCamera()
            router.push(`/pay/${token}`)
            return
          }
        }
      } catch {
        // ignore single-frame errors and keep going
      }
      // ~5 fps is plenty for QR
      setTimeout(tick, 200)
    }
    void tick()
  }

  function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasteError(null)
    const token = parseToken(linkInput)
    if (!token) {
      setPasteError("Couldn't read a payment link or token from that. Paste the full /pay/... URL or just the token.")
      return
    }
    router.push(`/pay/${token}`)
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Pay by QR</h1>
        <p className="text-gray-600 mt-2">
          Scan with your camera, or paste a payment link if scanning isn't an option.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Paste link */}
        <Card>
          <CardHeader>
            <CardTitle>Paste a payment link</CardTitle>
            <CardDescription>
              Works for any link in the form <span className="font-mono">…/pay/&lt;token&gt;</span>, or
              just the token on its own.
            </CardDescription>
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

        {/* Camera scanner */}
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
              <p className="text-sm text-gray-500">
                Tip: on a phone, the device camera will recognise the QR and open the link
                directly — you don't need this page at all.
              </p>
            ) : (
              <>
                <div className="relative bg-black rounded-md overflow-hidden aspect-video">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {!scanning && (
                    <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/50">
                      Camera off
                    </div>
                  )}
                </div>
                {cameraError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {cameraError}
                  </div>
                )}
                <div className="flex gap-2">
                  {!scanning ? (
                    <Button type="button" onClick={startCamera} className="flex-1">
                      Start camera
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={stopCamera} className="flex-1">
                      Stop camera
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">← Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
