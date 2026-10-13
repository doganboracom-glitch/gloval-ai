'use client'

import { useRef, type KeyboardEvent, type TouchEvent } from 'react'
import { resolveArrowKey, resolveSwipeDirection } from '@/lib/preview-interactive'

/**
 * Keyboard (ArrowLeft/ArrowRight) and touch-swipe support for a carousel
 * container. Spread the returned props onto the focusable carousel root.
 * Neither handler depends on click events, so they keep working while the
 * editor canvas swallows clicks in section-selection mode.
 */
export function useCarouselGestures(step: (direction: -1 | 1) => void, enabled: boolean) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  if (!enabled) return {}

  return {
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('input, textarea, select')) return
      const rtl = e.currentTarget.ownerDocument.dir === 'rtl' || e.currentTarget.closest('[dir="rtl"]') !== null
      const dir = resolveArrowKey(e.key, rtl)
      if (dir === 0) return
      e.preventDefault()
      step(dir)
    },
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0]
      touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const start = touchStart.current
      touchStart.current = null
      const t = e.changedTouches[0]
      if (!start || !t) return
      const dir = resolveSwipeDirection(t.clientX - start.x, t.clientY - start.y)
      if (dir !== 0) step(dir)
    },
  }
}
