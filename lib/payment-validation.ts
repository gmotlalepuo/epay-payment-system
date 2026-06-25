export type WalletForPayment = {
  id: string
  name?: string | null
  wallet_number: string
  balance: number
  currency: string
  status: string
}

export function parsePaymentAmount(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return null
  return Math.round(amount * 100) / 100
}

export function validatePositiveAmount(value: string | number, minimum = 0.01) {
  const amount = parsePaymentAmount(value)
  if (amount === null) return 'Enter a numeric amount.'
  if (amount < minimum) return `Amount must be at least P${minimum.toFixed(2)}.`
  return null
}

export function validateWalletPaymentAmount(value: string | number, wallet?: WalletForPayment | null) {
  const baseError = validatePositiveAmount(value)
  if (baseError) return baseError
  if (!wallet) return 'Select a wallet.'
  if (wallet.status !== 'active') return 'This wallet is not active.'

  const amount = parsePaymentAmount(value) ?? 0
  if (amount > Number(wallet.balance)) return 'Amount exceeds the selected wallet balance.'

  return null
}

export function walletLabel(wallet: WalletForPayment) {
  const name = wallet.name ? `${wallet.name} - ` : ''
  return `${name}${wallet.wallet_number} - P${Number(wallet.balance).toFixed(2)} ${wallet.currency} - ${wallet.status}`
}
