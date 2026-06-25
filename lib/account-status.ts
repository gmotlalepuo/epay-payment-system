export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'blocked'

export const RESTRICTED_ACCOUNT_STATUSES: AccountStatus[] = [
  'inactive',
  'suspended',
  'blocked',
]

export function isRestrictedAccountStatus(status?: string | null) {
  return RESTRICTED_ACCOUNT_STATUSES.includes(status as AccountStatus)
}

export function accountStatusMessage(status?: string | null) {
  switch (status) {
    case 'blocked':
      return 'Your account is blocked. Payments and wallet actions are disabled. Contact support to restore access.'
    case 'suspended':
      return 'Your account is suspended. Payments and wallet actions are disabled while this is reviewed.'
    case 'inactive':
      return 'Your account is inactive. Payments and wallet actions are disabled until your account is reactivated.'
    default:
      return null
  }
}
