'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { trackFunnelEvent, VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'

export function isPricingSectionViewed(entry: { isIntersecting: boolean }): boolean {
  return entry.isIntersecting
}

/**
 * Sends `pricing_view` (no properties) once when the pricing heading enters
 * the viewport. If analytics is not allowed at that moment, the observer keeps
 * waiting so a later consent can still produce a single event.
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
      { threshold: 0 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
}
