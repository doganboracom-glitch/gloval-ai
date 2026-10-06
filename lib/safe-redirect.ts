/**
 * Validates a caller-supplied "where to go next" path before it is ever
 * used in a redirect. Only same-site, absolute paths are allowed — this
 * blocks the classic open-redirect trick of passing a protocol-relative or
 * absolute external URL (e.g. `//evil.com`, `https://evil.com`) through a
 * `next`/`redirect_to` query param.
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}
