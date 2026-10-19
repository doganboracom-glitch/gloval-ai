/**
 * Validates an announcement link at render time. Only absolute http(s) URLs,
 * in-site paths (`/x`, not protocol-relative `//x`) and `#anchors` are allowed;
 * anything else (javascript:, data:, half-typed text) yields null and the item
 * renders as plain text.
 */
export function safeAnnouncementHref(
  raw: string | undefined,
  normalizeHref: (href: string) => string = (href) => href,
): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (value.startsWith('#') && value.length > 1) return value
  if (value.startsWith('/') && !value.startsWith('//')) return normalizeHref(value) || value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}
