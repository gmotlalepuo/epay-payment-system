export const DEFAULT_CURRENCY = 'BWP'
export const STRIPE_CURRENCY = 'bwp'

export function formatBwp(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat('en-BW', {
    style: 'currency',
    currency: DEFAULT_CURRENCY,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}
