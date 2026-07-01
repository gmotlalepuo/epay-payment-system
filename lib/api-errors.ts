import { NextResponse } from 'next/server'

type ApiErrorLike = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

export function friendlyApiMessage(error: unknown) {
  const source =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object'
        ? [
            (error as ApiErrorLike).message,
            (error as ApiErrorLike).code,
            (error as ApiErrorLike).details,
            (error as ApiErrorLike).hint,
          ]
            .filter(Boolean)
            .join(' ')
        : ''

  const normalized = source.toLowerCase()

  if (
    normalized.includes('users_phone_number_key') ||
    normalized.includes('phone_number') && normalized.includes('duplicate') ||
    normalized.includes('phone') && normalized.includes('unique')
  ) {
    return {
      status: 409,
      message: 'This phone number is already linked to another BotsaPay account.',
    }
  }

  if (
    normalized.includes('users_email_key') ||
    normalized.includes('email') && normalized.includes('duplicate') ||
    normalized.includes('email') && normalized.includes('unique')
  ) {
    return {
      status: 409,
      message: 'This email address is already linked to another BotsaPay account.',
    }
  }

  if (normalized.includes('duplicate key') || normalized.includes('unique constraint')) {
    return {
      status: 409,
      message: 'This information is already in use. Please check your details and try again.',
    }
  }

  if (normalized.includes('violates row-level security') || normalized.includes('permission denied')) {
    return {
      status: 403,
      message: 'You do not have permission to complete this action.',
    }
  }

  if (normalized.includes('bucket') && (normalized.includes('not found') || normalized.includes('does not exist'))) {
    return {
      status: 500,
      message: 'Profile photo storage is not set up yet. Please run the latest Supabase migration and try again.',
    }
  }

  if (normalized.includes('mime') || normalized.includes('unsupported')) {
    return {
      status: 422,
      message: 'Profile picture must be a supported image file.',
    }
  }

  return {
    status: 500,
    message: 'Something went wrong. Please try again.',
  }
}

export function friendlyErrorResponse(error: unknown, fallbackStatus = 500) {
  const friendly = friendlyApiMessage(error)
  return NextResponse.json(
    {
      error: friendly.message,
      userMessage: friendly.message,
    },
    { status: friendly.status === 500 ? fallbackStatus : friendly.status },
  )
}
