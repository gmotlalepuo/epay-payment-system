import {
  getAuthenticatedContext,
  type AuthContext,
} from '@/lib/auth'
import { accountStatusMessage, isRestrictedAccountStatus } from '@/lib/account-status'
import { NextRequest, NextResponse } from 'next/server'

type ActiveAccountResult =
  | { auth: AuthContext; response: null }
  | { auth: null; response: NextResponse }

export async function requireActiveAccount(request: NextRequest): Promise<ActiveAccountResult> {
  const auth = await getAuthenticatedContext(request)

  if (!auth) {
    return {
      auth: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  if (isRestrictedAccountStatus(auth.profile?.status)) {
    return {
      auth: null,
      response: NextResponse.json(
        {
          error: accountStatusMessage(auth.profile?.status) ?? 'Account restricted',
          account_status: auth.profile?.status,
        },
        { status: 403 },
      ),
    }
  }

  return { auth, response: null }
}
