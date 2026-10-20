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

/** Fixed hint the demo band appends to its example sentence; it must never reach a published site. */
export const ANNOUNCEMENT_SAMPLE_HINT = {
  tr: 'Duyurularınızı buraya ekleyebilirsiniz.',
  en: 'You can add your announcements here.',
} as const

/** Removes the demo hint (either language) from an announcement text, leaving the owner's sentence. */
export function stripAnnouncementHint(text: string): string {
  let result = text
  for (const hint of Object.values(ANNOUNCEMENT_SAMPLE_HINT)) {
    result = result.split(hint).join('')
  }
  return result.replace(/\s+/g, ' ').trim()
}

type MarqueeSpeed = 'slow' | 'normal' | 'fast'

/** Constant scroll speed, independent of how much text the band carries. */
export const ANNOUNCEMENT_PX_PER_SECOND: Record<MarqueeSpeed, number> = { slow: 30, normal: 60, fast: 110 }

const MAX_MARQUEE_REPEATS = 24
const ESTIMATED_CHAR_WIDTH_PX = 8
const ESTIMATED_ITEM_GAP_PX = 60
const ESTIMATED_VIEWPORT_PX = 1280

/**
 * Pre-measurement width of one run of items (SSR / first paint), so the first
 * frame already scrolls at roughly the right speed before real widths arrive.
 */
export function estimateAnnouncementUnitWidth(texts: readonly string[]): number {
  return texts.reduce((sum, text) => sum + text.length * ESTIMATED_CHAR_WIDTH_PX + ESTIMATED_ITEM_GAP_PX, 24)
}

/**
 * Marquee layout from measured widths. The unit (one run of every item) is
 * repeated until a group covers the visible band, so short text never leaves
 * a gap. The track holds two groups and shifts by exactly one group, so
 * `duration = groupWidth / speed` makes the speed constant in px/second.
 */
export function announcementMarqueeTiming(input: {
  unitWidth: number
  viewportWidth: number
  speed?: MarqueeSpeed
}): { repeats: number; durationSeconds: number } {
  const unit = input.unitWidth > 0 ? input.unitWidth : 1
  const viewport = input.viewportWidth > 0 ? input.viewportWidth : ESTIMATED_VIEWPORT_PX
  const repeats = Math.min(MAX_MARQUEE_REPEATS, Math.max(1, Math.ceil(viewport / unit)))
  const pxPerSecond = ANNOUNCEMENT_PX_PER_SECOND[input.speed ?? 'normal']
  return { repeats, durationSeconds: (unit * repeats) / pxPerSecond }
}

/** True when a non-empty link would not render as a link (shown as a hint in the editor). */
export function isInvalidAnnouncementLink(raw: string | undefined): boolean {
  return (raw ?? '').trim().length > 0 && safeAnnouncementHref(raw) === null
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
