import { updateSession } from '@/lib/supabase/proxy'
import { NextResponse, type NextRequest } from 'next/server'

function getAllowedCorsOrigins(request: NextRequest) {
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  const requestOrigin = request.nextUrl.origin

  return new Set([
    requestOrigin,
    siteUrl,
    vercelUrl,
    ...configuredOrigins,
  ].filter(Boolean))
}

function isLocalDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function resolveCorsOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return null

  if (isLocalDevelopmentOrigin(origin)) {
    return origin
  }

  return getAllowedCorsOrigins(request).has(origin) ? origin : null
}

function applyCorsHeaders(request: NextRequest, response: NextResponse) {
  const origin = resolveCorsOrigin(request)
  if (!origin) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  response.headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('access-control-request-headers') ?? 'Authorization, Content-Type',
  )
  response.headers.set('Vary', 'Origin')
  return response
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return applyCorsHeaders(request, new NextResponse(null, { status: 204 }))
    }

    const response = await updateSession(request)
    return applyCorsHeaders(request, response)
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
