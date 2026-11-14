'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { trackFunnelEvent, VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'

const VISIBLE_SHARE = 0.5

/**
 * The pricing section is several screens tall (cards + comparison table), so
 * "50% of the section" is unreachable on most viewports. It counts as viewed
 * when half of the section OR half of the viewport height shows it.
 */
export function isPricingSectionViewed(entry: {
  isIntersecting: boolean
  intersectionRatio: number
  intersectionRect: { height: number }
  rootBounds: { height: number } | null
}): boolean {
  if (!entry.isIntersecting) return false
  if (entry.intersectionRatio >= VISIBLE_SHARE) return true
  const viewportHeight = entry.rootBounds?.height ?? 0
  return viewportHeight > 0 && entry.intersectionRect.height >= viewportHeight * VISIBLE_SHARE
}

// A threshold list fine enough that a tall section still reports every step.
const THRESHOLDS = Array.from({ length: 51 }, (_, index) => index / 50)

/**
 * Sends `pricing_view` (no properties) at most once per page view when the
 * section is mostly visible. If analytics is not allowed at that moment the
 * event is simply not sent and the observer keeps waiting, so a later consent
 * can still produce a single event.
 */
export function usePricingViewTracking(ref: RefObject<HTMLElement | null>) {
  const sent = useRef(false)

  useEffect(() => {
    const element = ref.current
    if (!element || sent.current || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (sent.current) return
        for (const entry of entries) {
          if (!isPricingSectionViewed(entry)) continue
          if (trackFunnelEvent(VERCEL_FUNNEL_EVENTS.pricingView)) {
            sent.current = true
            observer.disconnect()
          }
          return
        }
      },
      { threshold: THRESHOLDS },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
}
