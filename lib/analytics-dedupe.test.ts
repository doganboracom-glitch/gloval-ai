// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'
import { metaEventIds } from '@/lib/analytics/event-ids'
import {
  resetVendor,
  setVendorReady,
  trackBeginCheckout,
  trackGenerateSiteCompleted,
  trackPublishSite,
  trackSignUp,
} from '@/lib/analytics'

vi.mock('@/lib/analytics-config', () => ({
  GA_MEASUREMENT_ID: null,
  META_PIXEL_ID: '123456789012345',
  isMeasurementSurface: () => true,
}))

let pixel: ReturnType<typeof vi.fn>
let bridgeFetch: ReturnType<typeof vi.fn<typeof fetch>>

function serverPayload() {
  const call = bridgeFetch.mock.calls.find(([input]) => String(input) === '/api/analytics/meta-event')
  expect(call).toBeDefined()
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>
}

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

describe('browser Pixel and server bridge event IDs', () => {
  it('emits sign_up once with the same browser and server ID when the callback repeats', () => {
    const userId = '5b3f3de9-9039-4ef9-9095-82c8f37bfeb2'
    trackSignUp('email', userId)
    trackSignUp('email', userId)

    const browser = pixelEvent('CompleteRegistration')
    const bridge = serverPayload()
    const eventId = metaEventIds.signup(userId)

    expect(browser[3]).toEqual({ eventID: eventId })
    expect(bridge).toMatchObject({ type: 'sign_up', userId })
    expect(pixel.mock.calls.filter(([, name]) => name === 'CompleteRegistration')).toHaveLength(1)
    expect(bridgeFetch.mock.calls).toHaveLength(1)
  })

  it('emits publish_site once with the same browser and server ID when the callback repeats', () => {
    const siteId = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'
    trackPublishSite(siteId)
    trackPublishSite(siteId)

    const browser = pixelEvent('PublishSite')
    const bridge = serverPayload()
    const eventId = metaEventIds.publish(siteId)

    expect(browser[3]).toEqual({ eventID: eventId })
    expect(bridge).toMatchObject({ type: 'publish_site', siteId })
    expect(pixel.mock.calls.filter(([, name]) => name === 'PublishSite')).toHaveLength(1)
    expect(bridgeFetch.mock.calls).toHaveLength(1)
  })

  it('emits begin_checkout once per attempt with the same browser and server ID', () => {
    const params = { value: 299, currency: 'TRY', item_category: 'subscription' }
    const nonce = 'checkout-attempt-1'
    trackBeginCheckout(params, nonce)
    trackBeginCheckout(params, nonce)

    const browser = pixelEvent('InitiateCheckout')
    const bridge = serverPayload()
    expect(bridge).toMatchObject({ type: 'begin_checkout', nonce })
    expect(browser[3]).toEqual({ eventID: metaEventIds.checkout(nonce) })
    expect(pixel.mock.calls.filter(([, name]) => name === 'InitiateCheckout')).toHaveLength(1)
    expect(bridgeFetch.mock.calls).toHaveLength(1)
  })

  it('reports repeated processing of the same generation response once', () => {
    const response = { source: 'ai' as const }
    const nonce = 'generation-attempt-1'
    trackGenerateSiteCompleted(response.source, nonce)
    trackGenerateSiteCompleted(response.source, nonce)

    const browser = pixelEvent('GenerateSiteCompleted')
    const bridge = serverPayload()
    expect(browser[0]).toBe('trackCustom')
    expect(browser[2]).toEqual({ source: response.source })
    expect(browser[3]).toEqual({ eventID: metaEventIds.generate(nonce) })
    expect(bridge).toMatchObject({ type: 'generate_site_completed', source: response.source, nonce })
    expect(pixel.mock.calls.filter(([, name]) => name === 'GenerateSiteCompleted')).toHaveLength(1)
    expect(bridgeFetch.mock.calls).toHaveLength(1)
  })
})
