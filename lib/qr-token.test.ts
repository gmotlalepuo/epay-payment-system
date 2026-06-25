import { describe, expect, it } from 'vitest'
import { parseQrToken } from './qr-token'

describe('parseQrToken', () => {
  it('parses standard pay paths', () => {
    expect(parseQrToken('/pay/ABC12345')).toBe('ABC12345')
    expect(parseQrToken('https://example.com/pay/ABC_123-45')).toBe('ABC_123-45')
  })

  it('parses query-token QR formats', () => {
    expect(parseQrToken('/qr/pay?token=abc12345')).toBe('abc12345')
    expect(parseQrToken('https://example.com/qr/pay?token=abc12345&utm=1')).toBe('abc12345')
  })

  it('parses bare tokens and rejects invalid input', () => {
    expect(parseQrToken('abc12345')).toBe('abc12345')
    expect(parseQrToken('not a token')).toBeNull()
    expect(parseQrToken('abc')).toBeNull()
  })
})
