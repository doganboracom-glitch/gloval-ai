'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { CONSENT_CHANGE_EVENT, readConsent, type CookieConsent } from '@/lib/cookie-consent-storage'
import { GA_MEASUREMENT_ID, META_PIXEL_ID, isMeasurementHost, isMeasurementSurface } from '@/lib/analytics-config'
import {
  clearVendorCookies,
  ensureFbq,
  ensureGtag,
  resetVendor,
  setVendorReady,
  trackEvent,
  trackLandingView,
  trackSignupStart,
  trackSignUp,
} from '@/lib/analytics'
import { ANALYTICS_EVENTS, OAUTH_SIGNUP_EVENT_PARAM } from '@/lib/analytics-events'
import { readAttribution, snapshotFromLocation, type Attribution } from '@/lib/attribution'
import { newEventNonce } from '@/lib/analytics/event-ids'
import { useAttributionCapture } from '@/components/analytics/use-attribution-capture'
import { usePurchaseReturn } from '@/components/analytics/use-purchase-return'

/**
 * Loads GA4 and Meta Pixel on the gloval.ai platform only, and only after the
 * visitor consented: GA4 for the "analytics" category, Meta Pixel for
 * "marketing". Withdrawing consent disables the vendor immediately and removes
 * its cookies. Customer sites are never measured (see `isMeasurementSurface`).
 */
export function AnalyticsLoader() {
  const pathname = usePathname()
  const [consent, setConsent] = useState<CookieConsent | null>(null)
  const [surfaceOk, setSurfaceOk] = useState(false)
  const [attributionSurfaceOk, setAttributionSurfaceOk] = useState(false)

  const gaWasOn = useRef(false)
  const metaWasOn = useRef(false)
  const gaConfigured = useRef(false)
  const metaInitialised = useRef(false)
  const gaLastPath = useRef<string | null>(null)
  const metaLastPath = useRef<string | null>(null)
  const initialLandingRef = useRef<Attribution | null>(null)
  const landingEventNonceRef = useRef<string | null>(null)
  const landingEventSentRef = useRef(false)
  const signupStartNonceRef = useRef<string | null>(null)
  const signupStartSentRef = useRef(false)

  useEffect(() => {
    const sync = () => setConsent(readConsent())
    sync()
    initialLandingRef.current = snapshotFromLocation()
    landingEventNonceRef.current = newEventNonce()
    window.addEventListener(CONSENT_CHANGE_EVENT, sync)
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync)
  }, [])

  useEffect(() => {
    setSurfaceOk(isMeasurementSurface(window.location.hostname, pathname))
    setAttributionSurfaceOk(isMeasurementHost(window.location.hostname, pathname))
  }, [pathname])

  const gaOn = surfaceOk && Boolean(GA_MEASUREMENT_ID) && consent?.analytics === true
  const metaOn = surfaceOk && Boolean(META_PIXEL_ID) && consent?.marketing === true
  const marketingOn = consent?.marketing === true

  useAttributionCapture(consent, attributionSurfaceOk)
  usePurchaseReturn(pathname)

  useEffect(() => {
    if (!surfaceOk || landingEventSentRef.current || !landingEventNonceRef.current) return
    const timer = window.setTimeout(() => {
      const firstTouch = readAttribution()
      const initialLanding = initialLandingRef.current
      const landing = firstTouch
        ? { ...firstTouch, landing_path: initialLanding?.landing_path ?? firstTouch.landing_path }
        : initialLanding
      if (trackLandingView(landing, landingEventNonceRef.current!)) landingEventSentRef.current = true
    }, 150)
    return () => window.clearTimeout(timer)
  }, [pathname, surfaceOk, gaOn, metaOn, consent])

  useEffect(() => {
    if (pathname !== '/auth/sign-up') {
      signupStartNonceRef.current = null
      signupStartSentRef.current = false
      return
    }
    if (!surfaceOk || signupStartSentRef.current) return
    signupStartNonceRef.current ??= newEventNonce()
    const timer = window.setTimeout(() => {
      if (signupStartNonceRef.current && trackSignupStart(signupStartNonceRef.current)) {
        signupStartSentRef.current = true
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [pathname, surfaceOk, gaOn, metaOn, consent])

  useEffect(() => {
    const url = new URL(window.location.href)
    const signupEventNonce = url.searchParams.get(OAUTH_SIGNUP_EVENT_PARAM)
    if (!signupEventNonce) return
    const tracked = trackSignUp('google', signupEventNonce)
    if (!tracked && readConsent()?.analytics !== false) return
    url.searchParams.delete(OAUTH_SIGNUP_EVENT_PARAM)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [pathname, consent, gaOn, metaOn])

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return
    const disableKey = `ga-disable-${GA_MEASUREMENT_ID}` as const
    const gtag = ensureGtag()

    if (!gaConfigured.current && surfaceOk) {
      gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500,
      })
    }

    if (gaOn) {
      const ads = marketingOn ? 'granted' : 'denied'
      gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: ads,
        ad_user_data: ads,
        ad_personalization: ads,
      })
      ;(window as unknown as Record<string, unknown>)[disableKey] = false
      if (!gaConfigured.current) {
        gtag('js', new Date())
        gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
        gaConfigured.current = true
      }
      setVendorReady('ga')
      gaWasOn.current = true
    } else if (gaWasOn.current) {
      gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })
      ;(window as unknown as Record<string, unknown>)[disableKey] = true
      resetVendor('ga')
      clearVendorCookies('ga')
      gaLastPath.current = null
      gaWasOn.current = false
    }
  }, [gaOn, marketingOn, surfaceOk])

  useEffect(() => {
    if (!META_PIXEL_ID) return
    if (metaOn) {
      const fbq = ensureFbq()
      if (!metaInitialised.current) {
        fbq('set', 'autoConfig', false, META_PIXEL_ID)
        fbq('init', META_PIXEL_ID)
        metaInitialised.current = true
      } else {
        fbq('consent', 'grant')
      }
      setVendorReady('meta')
      metaWasOn.current = true
    } else if (metaWasOn.current) {
      window.fbq?.('consent', 'revoke')
      resetVendor('meta')
      clearVendorCookies('meta')
      metaLastPath.current = null
      metaWasOn.current = false
    }
  }, [metaOn])

  useEffect(() => {
    if (!gaOn && !metaOn) return
    const timer = window.setTimeout(() => {
      const params = {
        page_path: pathname,
        page_location: `${window.location.origin}${pathname ?? ''}`,
        page_title: document.title,
      }
      if (gaOn && gaLastPath.current !== pathname) {
        gaLastPath.current = pathname
        trackEvent(ANALYTICS_EVENTS.pageView, params, { vendors: ['ga'] })
      }
      if (metaOn && metaLastPath.current !== pathname) {
        metaLastPath.current = pathname
        trackEvent(ANALYTICS_EVENTS.pageView, params, { vendors: ['meta'] })
      }
    }, 150)
    return () => window.clearTimeout(timer)
  }, [pathname, gaOn, metaOn])

  return (
    <>
      {gaOn && GA_MEASUREMENT_ID && (
        <Script
          id="ga4-gtag"
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
      )}
      {metaOn && (
        <Script
          id="meta-pixel"
          src="https://connect.facebook.net/en_US/fbevents.js"
          strategy="afterInteractive"
        />
      )}
    </>
  )
}
