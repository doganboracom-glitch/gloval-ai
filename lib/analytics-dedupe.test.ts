// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'
import { metaEventIds } from '@/lib/analytics/event-ids'
import {
  resetVendor,
  setVendorReady,
  trackBeginCheckout,
  trackGenerateSiteCompleted,
  trackGenerateSiteStarted,
  trackPublishSite,
  trackPurchase,
  trackSignUp,
} from '@/lib/analytics'

vi.mock('@/lib/analytics-config', () => ({
  GA_MEASUREMENT_ID: null,
  META_PIXEL_ID: '123456789012345',
  isMeasurementSurface: () => true,
}))

let pixel: ReturnType<typeof vi.fn>
let bridgeFetch: ReturnType<typeof vi.fn<typeof fetch>>

function pixelEvent(eventName: string) {
  const call = pixel.mock.calls.find(([, name]) => name === eventName)
  expect(call).toBeDefined()
  return call as unknown[]
}

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({
    v: CONSENT_VERSION,
    necessary: true,
    analytics: false,
    marketing: true,
  }))}; path=/`
  window.localStorage.removeItem('gloval_purchases_sent')

  pixel = vi.fn()
  Object.defineProperty(window, 'fbq', { configurable: true, value: pixel })
  resetVendor('meta')
  setVendorReady('meta')

  bridgeFetch = vi.fn<typeof fetch>(async () => ({ ok: true, status: 202 } as Response))
  vi.stubGlobal('fetch', bridgeFetch)
})

afterEach(() => {
  resetVendor('meta')
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'fbq', { configurable: true, value: undefined })
})

describe('privacy-safe funnel events', () => {
  it('emits sign_up once with an opaque occurrence ID', () => {
    const nonce = 'email-signup-attempt-1'
    trackSignUp('email', nonce)
    trackSignUp('email', nonce)

    const browser = pixelEvent('CompleteRegistration')
    expect(browser[2]).toMatchObject({
      status: true,
      content_name: 'email',
      utm_source: 'direct',
      utm_medium: 'direct',
      utm_campaign: 'direct',
    })
    expect(String((browser[3] as Record<string, unknown>)?.eventID)).toMatch(/^signup:[A-Za-z0-9_-]+$/)
    expect(JSON.stringify(browser[2])).not.toContain(nonce)
    expect(pixel.mock.calls.filter(([, name]) => name === 'CompleteRegistration')).toHaveLength(1)
    expect(bridgeFetch).not.toHaveBeenCalled()
  })

  it('emits publish_success once per attempt without a site identifier', () => {
    const nonce = 'publish-attempt-1'
    trackPublishSite(nonce)
    trackPublishSite(nonce)

    const browser = pixelEvent('PublishSuccess')
    expect(browser[3]).toEqual({ eventID: metaEventIds.publish(nonce) })
    expect(browser[2]).toMatchObject({ utm_source: 'direct', utm_medium: 'direct', utm_campaign: 'direct' })
    expect(JSON.stringify(browser[2])).not.toContain(nonce)
    expect(pixel.mock.calls.filter(([, name]) => name === 'PublishSuccess')).toHaveLength(1)
    expect(bridgeFetch).not.toHaveBeenCalled()
  })

  it('emits begin_checkout once per checkout attempt with campaign props', () => {
    const params = { value: 299, currency: 'TRY', item_category: 'subscription' }
    const nonce = 'checkout-attempt-1'
    trackBeginCheckout(params, nonce)
    trackBeginCheckout(params, nonce)

    const browser = pixelEvent('InitiateCheckout')
    expect(browser[2]).toMatchObject({
      value: 299,
      currency: 'TRY',
      utm_source: 'direct',
      utm_medium: 'direct',
      utm_campaign: 'direct',
    })
    expect(browser[3]).toEqual({ eventID: metaEventIds.checkout(nonce) })
    expect(pixel.mock.calls.filter(([, name]) => name === 'InitiateCheckout')).toHaveLength(1)
  })

  it('emits generation start and success once per attempt', () => {
    const nonce = 'generation-attempt-1'
    trackGenerateSiteStarted(nonce)
    trackGenerateSiteStarted(nonce)
    trackGenerateSiteCompleted('ai', nonce)
    trackGenerateSiteCompleted('ai', nonce)

    const started = pixelEvent('SiteGenerateStart')
    const completed = pixelEvent('SiteGenerateSuccess')
    expect(started[3]).toEqual({ eventID: metaEventIds.generateStart(nonce) })
    expect(completed[2]).toMatchObject({ source: 'ai', utm_source: 'direct' })
    expect(completed[3]).toEqual({ eventID: metaEventIds.generate(nonce) })
    expect(pixel.mock.calls.filter(([, name]) => name === 'SiteGenerateStart')).toHaveLength(1)
    expect(pixel.mock.calls.filter(([, name]) => name === 'SiteGenerateSuccess')).toHaveLength(1)
    expect(bridgeFetch).not.toHaveBeenCalled()
  })

  it('emits purchase with value, currency, and attribution only', () => {
    const purchase = { transaction_id: 'tx_private_123456', value: 499, currency: 'TRY', item_category: 'subscription' as const }
    expect(trackPurchase(purchase)).toBe(true)
    expect(trackPurchase(purchase)).toBe(false)

    const browser = pixelEvent('Purchase')
    expect(browser[2]).toMatchObject({
      value: 499,
      currency: 'TRY',
      utm_source: 'direct',
      utm_medium: 'direct',
      utm_campaign: 'direct',
    })
    expect(JSON.stringify(browser)).not.toContain(purchase.transaction_id)
    expect(pixel.mock.calls.filter(([, name]) => name === 'Purchase')).toHaveLength(1)
  })

  it('swallows vendor errors so instrumentation cannot interrupt the caller', () => {
    pixel.mockImplementation(() => {
      throw new Error('analytics unavailable')
    })
    expect(() => trackSignUp('email', 'signup-error-attempt')).not.toThrow()
  })
})
