import type { FocusEvent } from 'react'

const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const KEYBOARD_SETTLE_DELAY_MS = 350
const SAFE_VIEWPORT_MARGIN_PX = 32

export function keepAuthFieldVisibleOnMobile(event: FocusEvent<HTMLInputElement>) {
  if (typeof window === 'undefined') return

  const isSmallViewport =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
      : window.innerWidth <= 767
  if (!isSmallViewport) return

  const field = event.currentTarget
  window.setTimeout(() => {
    if (!field.isConnected || document.activeElement !== field) return

    const viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewport ? viewportTop + viewport.height : window.innerHeight
    const { top, bottom } = field.getBoundingClientRect()
    if (
      top >= viewportTop + SAFE_VIEWPORT_MARGIN_PX &&
      bottom <= viewportBottom - SAFE_VIEWPORT_MARGIN_PX
    ) {
      return
    }

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches

    field.scrollIntoView({
      behavior: prefersReducedMotion ? 'instant' : 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  }, KEYBOARD_SETTLE_DELAY_MS)
}
