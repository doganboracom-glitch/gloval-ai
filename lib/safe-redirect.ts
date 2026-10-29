/**
 * Validates a caller-supplied "where to go next" path before it is ever
 * used in a redirect. Only same-site, absolute paths are allowed — this
 * blocks the classic open-redirect trick of passing a protocol-relative or
 * absolute external URL (e.g. `//evil.com`, `https://evil.com`) through a
 * `next`/`redirect_to` query param.
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback
  if (!isSameSitePath(raw)) return fallback
  return raw
}

// URL parsers strip tab/CR/LF anywhere in the string, so "/\t/evil.com" would
// collapse to the protocol-relative "//evil.com" after this check has passed.
// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/

function isSameSitePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !CONTROL_OR_SPACE.test(value)
}

/** Auth confirmation links may be nested-encoded by their email template. */
export function sanitizeNextPathWithDecoding(
  raw: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!raw) return fallback

  let candidate = raw
  for (let decodeCount = 0; decodeCount < 2 && candidate.includes('%'); decodeCount += 1) {
    try {
      candidate = decodeURIComponent(candidate)
    } catch {
      return fallback
    }
  }

  return isSameSitePath(candidate) ? candidate : fallback
}
