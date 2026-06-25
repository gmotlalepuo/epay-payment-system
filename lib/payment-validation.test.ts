import { describe, expect, it } from 'vitest'
import {
  parsePaymentAmount,
  validatePositiveAmount,
  validateWalletPaymentAmount,
  walletLabel,
} from './payment-validation'

const wallet = {
  id: 'wallet-1',
  name: 'Main',
  wallet_number: 'W123',
  balance: 100,
  currency: 'BWP',
  status: 'active',
}

describe('payment validation', () => {
  it('parses numeric amounts to cents precision', () => {
    expect(parsePaymentAmount('12.345')).toBe(12.35)
    expect(parsePaymentAmount('abc')).toBeNull()
  })

  it('requires positive amounts', () => {
    expect(validatePositiveAmount('0')).toBe('Amount must be at least P0.01.')
    expect(validatePositiveAmount('x')).toBe('Enter a numeric amount.')
    expect(validatePositiveAmount('8', 8)).toBeNull()
  })

  it('rejects inactive wallets and insufficient balance', () => {
    expect(validateWalletPaymentAmount('101', wallet)).toBe('Amount exceeds the selected wallet balance.')
    expect(validateWalletPaymentAmount('1', { ...wallet, status: 'frozen' })).toBe('This wallet is not active.')
  })

  it('formats wallet selector labels with status', () => {
    expect(walletLabel(wallet)).toBe('Main - W123 - P100.00 BWP - active')
  })
})
