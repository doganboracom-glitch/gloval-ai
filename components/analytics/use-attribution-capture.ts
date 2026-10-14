'use client'

import { useEffect, useRef } from 'react'
import type { CookieConsent } from '@/lib/cookie-consent-storage'
import {
  clearAttribution,
  readAttribution,
  shouldReplaceAttribution,
  snapshotFromLocation,
  writeAttribution,
  type Attribution,
} from '@/lib/attribution'

/**
 * Captures first-touch campaign attribution. The landing URL is held in memory
 * only until the visitor accepts analytics or marketing cookies (the banner
 * usually appears after the campaign parameters have already been navigated
 * away from); nothing is written before that, and withdrawing consent deletes
 * the cookie.
 */
export function useAttributionCapture(consent: CookieConsent | null, surfaceOk: boolean) {
  const pending = useRef<Attribution | null>(null)

  useEffect(() => {
    if (!surfaceOk) return
    const snapshot = snapshotFromLocation()
    if (!snapshot) return
    if (!pending.current || (Object.keys(pending.current.params).length === 0 && Object.keys(snapshot.params).length > 0)) {
      pending.current = snapshot
    }
    // Re-evaluated on every route change so a campaign URL is never missed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceOk, typeof window === 'undefined' ? '' : window.location.pathname + window.location.search])

  useEffect(() => {
    if (!surfaceOk || !consent) return
    const allowed = consent.analytics === true || consent.marketing === true
    if (!allowed) {
      pending.current = null
      clearAttribution()
      return
    }
    const incoming = pending.current ?? snapshotFromLocation()
    if (incoming && shouldReplaceAttribution(readAttribution(), incoming)) {
      writeAttribution(incoming)
    }
  }, [consent, surfaceOk])
}
