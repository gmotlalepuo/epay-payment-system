export function parseQrToken(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const tokenFromUrl = parseUrlToken(trimmed)
  if (tokenFromUrl) return tokenFromUrl

  const tokenFromPath = parsePathToken(trimmed)
  if (tokenFromPath) return tokenFromPath

  if (/^[A-Za-z0-9_-]{6,64}$/.test(trimmed)) return trimmed

  return null
}

function parseUrlToken(value: string) {
  try {
    const url = new URL(value)
    const token = url.searchParams.get('token')
    if (isToken(token)) return token

    return parsePathToken(url.pathname)
  } catch {
    return null
  }
}

function parsePathToken(value: string) {
  const queryLike = value.match(/[?&]token=([A-Za-z0-9_-]{6,64})/)
  if (queryLike?.[1]) return queryLike[1]

  const payPath = value.match(/(?:^|\/)(?:pay|qr\/pay)\/([A-Za-z0-9_-]{6,64})(?:$|[/?#])/)
  if (payPath?.[1]) return payPath[1]

  return null
}

function isToken(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{6,64}$/.test(value))
}
