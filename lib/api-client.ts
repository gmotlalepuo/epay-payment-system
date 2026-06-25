'use client'

import { toast } from 'sonner'

type ApiFetchOptions = RequestInit & {
  redirectOnUnauthorized?: boolean
}

export async function apiFetch(input: RequestInfo | URL, init?: ApiFetchOptions) {
  const response = await fetch(input, init)

  if (
    response.status === 401 &&
    init?.redirectOnUnauthorized !== false &&
    typeof window !== 'undefined'
  ) {
    toast.error('Session expired', {
      description: 'Please sign in again to continue.',
    })
    const next = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`)
  }

  if (response.status === 403 && typeof window !== 'undefined') {
    const data = await response.clone().json().catch(() => null)
    if (data?.account_status || /account/i.test(String(data?.error ?? ''))) {
      toast.error('Account restricted', {
        description: data?.error ?? 'Your account status prevents this action.',
      })
      window.location.assign('/account-status')
    }
  }

  return response
}
