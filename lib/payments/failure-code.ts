const PLAIN_CODE = /^[a-z][a-z0-9_]{2,63}$/
const TOKEN_LIKE = /[A-Za-z0-9+/=_-]{24,}/g

function sanitize(text: string, max: number): string {
  return text
    .replace(TOKEN_LIKE, '[redacted]')
    .replace(/[^\p{L}\p{N} .:_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Collapses any thrown value into a short, secret-free diagnostic that is safe
 * to return to the browser. Known snake_case codes (PaymentConfigError and the
 * adapters' own `iyzico_*` codes) pass through; iyzico's human-readable
 * `errorMessage` is kept short and sanitized; everything else (provider
 * payloads, DB errors, stack traces) is reduced to a generic code. Never empty.
 */
export function toSafeFailureCode(error: unknown): string {
  const fallback = 'payment_init_failed'
  if (error == null) return fallback

  const source = error as { message?: unknown; code?: unknown; name?: unknown }
  const message = typeof source.message === 'string' ? source.message.trim() : ''

  if (PLAIN_CODE.test(message)) return message

  if (message.startsWith('iyzico_error:')) {
    const rest = sanitize(message.slice('iyzico_error:'.length), 80)
    return rest ? `iyzico_error: ${rest}` : 'iyzico_error'
  }

  if (typeof source.code === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(source.code)) {
    return `db_error_${source.code.toLowerCase().replace(/-/g, '_')}`
  }

  const name = typeof source.name === 'string' ? source.name : ''
  if (name && name !== 'Error') {
    const snake = name
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
    if (PLAIN_CODE.test(snake)) return snake
  }

  return fallback
}
