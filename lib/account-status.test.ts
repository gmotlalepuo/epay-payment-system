import { describe, expect, it } from 'vitest'
import { accountStatusMessage, isRestrictedAccountStatus } from './account-status'

describe('account status helpers', () => {
  it('detects restricted account statuses', () => {
    expect(isRestrictedAccountStatus('blocked')).toBe(true)
    expect(isRestrictedAccountStatus('suspended')).toBe(true)
    expect(isRestrictedAccountStatus('inactive')).toBe(true)
    expect(isRestrictedAccountStatus('active')).toBe(false)
  })

  it('returns clear user-facing messages', () => {
    expect(accountStatusMessage('blocked')).toContain('blocked')
    expect(accountStatusMessage('active')).toBeNull()
  })
})
