'use client'

import { readConsent, type CookieConsent } from '@/lib/cookie-consent-storage'
import { GA_MEASUREMENT_ID, META_PIXEL_ID, isMeasurementSurface } from '@/lib/analytics-config'
import {
  ANALYTICS_EVENTS,
  META_EVENT_MAP,
  toMetaPayload,
  type AnalyticsEventName,
  type AnalyticsParams,
  type PurchaseKind,
} from '@/lib/analytics-events'

/**
 * Consent-gated event dispatcher for GA4 and Meta Pixel.
 *
 * - GA4 needs the "analytics" cookie category; Meta Pixel needs "marketing".
 * - Nothing is sent without consent, off the platform surface, or when the
 *   vendor's ID is missing/invalid.
 * - Events fired before a vendor finished initialising are held in a small
 *   queue so `config`/`init` always run first.
 */

export type Vendor = 'ga' | 'meta'

type GtagFn = (...args: unknown[]) => void
type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[]
  push?: unknown
  loaded?: boolean
  version?: string
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: GtagFn
    fbq?: FbqFn
    _fbq?: FbqFn
  }
}

const MAX_PENDING = 50
const ready: Record<Vendor, boolean> = { ga: false, meta: false }
const pending: Record<Vendor, Array<() => void>> = { ga: [], meta: [] }

export function allowedVendors(consent: CookieConsent | null): Vendor[] {
  const vendors: Vendor[] = []
  if (consent?.analytics === true && GA_MEASUREMENT_ID) vendors.push('ga')
  if (consent?.marketing === true && META_PIXEL_ID) vendors.push('meta')
  return vendors
}

export function ensureGtag(): GtagFn {
  window.dataLayer = window.dataLayer || []
  if (!window.gtag) {
    // gtag.js requires the `arguments` object itself on the dataLayer.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
  }
  return window.gtag
}

export function ensureFbq(): FbqFn {
  if (window.fbq) return window.fbq
  const stub: FbqFn = function (...args: unknown[]) {
    if (stub.callMethod) stub.callMethod(...args)
    else stub.queue!.push(args)
  }
  if (!window._fbq) window._fbq = stub
  stub.push = stub
  stub.loaded = true
  stub.version = '2.0'
  stub.queue = []
  window.fbq = stub
  return stub
}

export function setVendorReady(vendor: Vendor): void {
  ready[vendor] = true
  const queued = pending[vendor].splice(0)
  queued.forEach((send) => send())
}

export function resetVendor(vendor: Vendor): void {
  ready[vendor] = false
  pending[vendor] = []
}

function dispatch(vendor: Vendor, send: () => void): void {
  if (ready[vendor]) {
    send()
    return
  }
  if (pending[vendor].length < MAX_PENDING) pending[vendor].push(send)
}

function sendToGa(name: AnalyticsEventName, params: AnalyticsParams): void {
  ensureGtag()('event', name, params)
}

function sendToMeta(name: AnalyticsEventName, params: AnalyticsParams): void {
  const mapping = META_EVENT_MAP[name]
  const { data, eventId } = toMetaPayload(name, params)
  const fbq = ensureFbq()
  const method = mapping.kind === 'standard' ? 'track' : 'trackCustom'
  if (eventId) fbq(method, mapping.name, data, { eventID: eventId })
  else fbq(method, mapping.name, data)
}

/**
 * Sends one event to every vendor the visitor has consented to. Returns true
 * when at least one vendor accepted (sent or queued) it.
 */
export function trackEvent(
  name: AnalyticsEventName,
  params: AnalyticsParams = {},
  options: { vendors?: Vendor[] } = {},
): boolean {
  if (typeof window === 'undefined') return false
  if (!isMeasurementSurface(window.location.hostname, window.location.pathname)) return false

  const allowed = allowedVendors(readConsent())
  const targets = options.vendors ? allowed.filter((v) => options.vendors!.includes(v)) : allowed
  if (targets.length === 0) return false

  for (const vendor of targets) {
    if (vendor === 'ga') dispatch('ga', () => sendToGa(name, params))
    else dispatch('meta', () => sendToMeta(name, params))
  }
  return true
}

export function trackSignUp(method: 'email' | 'google' = 'email'): void {
  trackEvent(ANALYTICS_EVENTS.signUp, { method })
}

export function trackGenerateSiteStarted(): void {
  trackEvent(ANALYTICS_EVENTS.generateSiteStarted)
}

export function trackGenerateSiteCompleted(source: 'ai' | 'fallback'): void {
  trackEvent(ANALYTICS_EVENTS.generateSiteCompleted, { source })
}

export function trackPublishSite(): void {
  trackEvent(ANALYTICS_EVENTS.publishSite)
}

export function trackBeginCheckout(params: { value?: number; currency?: string; item_category?: string } = {}): void {
  trackEvent(ANALYTICS_EVENTS.beginCheckout, params)
}

const SENT_PURCHASES_KEY = 'gloval_purchases_sent'
const MAX_REMEMBERED_PURCHASES = 50

function readSentPurchases(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SENT_PURCHASES_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Reports a VERIFIED purchase exactly once per transaction. Callers must only
 * invoke this after the server confirmed the payment as paid; the transaction
 * ID is remembered locally so reloads, repeated callbacks and re-delivered
 * messages cannot double-count it.
 */
export function trackPurchase(purchase: {
  transaction_id: string
  value: number
  currency: string
  item_category: PurchaseKind
}): boolean {
  if (typeof window === 'undefined') return false
  const sent = readSentPurchases()
  if (sent.includes(purchase.transaction_id)) return false

  const accepted = trackEvent(ANALYTICS_EVENTS.purchase, {
    transaction_id: purchase.transaction_id,
    value: purchase.value,
    currency: purchase.currency,
    item_category: purchase.item_category,
    items: [{ item_id: purchase.item_category, item_name: purchase.item_category, price: purchase.value, quantity: 1 }],
  })
  if (!accepted) return false

  try {
    window.localStorage.setItem(
      SENT_PURCHASES_KEY,
      JSON.stringify([...sent, purchase.transaction_id].slice(-MAX_REMEMBERED_PURCHASES)),
    )
  } catch {
    // Without storage the in-flight duplicate guard is best effort.
  }
  return true
}

function expireCookie(name: string): void {
  const host = window.location.hostname
  const parts = host.split('.')
  const domains = new Set<string | undefined>([undefined, host])
  for (let i = 1; i < parts.length - 1; i += 1) domains.add(`.${parts.slice(i).join('.')}`)
  domains.forEach((domain) => {
    document.cookie = `${name}=; path=/; max-age=0${domain ? `; domain=${domain}` : ''}`
  })
}

/** Removes the vendor's own first-party cookies once consent is withdrawn. */
export function clearVendorCookies(vendor: Vendor): void {
  const names = document.cookie.split('; ').map((entry) => entry.split('=')[0])
  const matches =
    vendor === 'ga'
      ? (n: string) => n === '_ga' || n === '_gid' || n.startsWith('_ga_') || n.startsWith('_gat')
      : (n: string) => n === '_fbp' || n === '_fbc'
  names.filter(matches).forEach(expireCookie)
}
