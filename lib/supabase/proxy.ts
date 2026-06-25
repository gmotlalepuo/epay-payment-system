import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_PAGES = ['/auth/login', '/auth/signup']
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/account-status']
const RESTRICTED_STATUSES = ['inactive', 'suspended', 'blocked']

function redirectWithCookies(request: NextRequest, supabaseResponse: NextResponse, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  const response = NextResponse.redirect(url)
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  return response
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthPage = AUTH_PAGES.some((path) => pathname === path)
  const isProtectedPath = PROTECTED_PREFIXES.some((path) => pathname.startsWith(path))

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  if (user && isAuthPage) {
    return redirectWithCookies(request, supabaseResponse, '/dashboard')
  }

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()

    const restricted = RESTRICTED_STATUSES.includes(profile?.status ?? '')
    if (restricted && pathname !== '/account-status' && !pathname.startsWith('/auth')) {
      return redirectWithCookies(request, supabaseResponse, '/account-status')
    }

    if (!restricted && pathname === '/account-status') {
      return redirectWithCookies(request, supabaseResponse, '/dashboard')
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
