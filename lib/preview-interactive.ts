/**
 * Marks carousel controls (arrows, dots, swipe surface) that must keep working
 * while the editor canvas is in section-selection mode. Selection mode swallows
 * every click in the capture phase so links/"add to cart" stay inert; elements
 * carrying this attribute are the deliberate exception.
 */
export const KEEP_INTERACTIVE_ATTR = 'data-gv-keep-interactive'
export const KEEP_INTERACTIVE_PROPS = { [KEEP_INTERACTIVE_ATTR]: '' } as const

type ClosestCapable = { closest?: (selector: string) => Element | null } | null | undefined

/** True when the event target sits inside a carousel control that opts out of selection capture. */
export function isKeepInteractiveTarget(target: unknown): boolean {
  const el = target as ClosestCapable
  if (!el || typeof el.closest !== 'function') return false
  return el.closest(`[${KEEP_INTERACTIVE_ATTR}]`) !== null
}

/** Minimum horizontal travel (px) and horizontal dominance for a touch swipe. */
const SWIPE_MIN_DISTANCE = 40

/** Returns -1 (previous), 1 (next) or 0 (not a horizontal swipe). */
export function resolveSwipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

/** Maps ArrowLeft/ArrowRight to a carousel step; respects RTL. Returns 0 for other keys. */
export function resolveArrowKey(key: string, rtl = false): -1 | 0 | 1 {
  if (key === 'ArrowRight') return rtl ? -1 : 1
  if (key === 'ArrowLeft') return rtl ? 1 : -1
  return 0
}
