export type AnnouncementPlacement =
  /** No visible announcement. */
  | 'none'
  /** First visible section: rendered above the logo/menu header. */
  | 'above-header'
  /** Anywhere else: rendered in the page flow at its position in the list. */
  | 'in-flow'

/**
 * Where the (single) announcement band renders, from its position in the home
 * section list. Hidden sections are skipped, so a band that only has hidden
 * sections above it still counts as first.
 */
export function announcementPlacement(
  sections: readonly { type: string; hidden?: boolean }[],
): AnnouncementPlacement {
  const firstVisible = sections.find((section) => !section.hidden)
  if (!firstVisible) return 'none'
  if (!sections.some((section) => section.type === 'announcement' && !section.hidden)) return 'none'
  return firstVisible.type === 'announcement' ? 'above-header' : 'in-flow'
}

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
