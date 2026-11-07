import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/server', () => ({ after: (fn: () => unknown) => void fn() }))

import {
  buildUserData,
  normalizeEmail,
  normalizePhone,
  resetMetaCapiState,
  sendMetaCapiEvent,
  sha256Hex,
  type MetaCapiEvent,
} from './meta-capi'
import { buildCapiContext, hasMarketingConsent } from './meta-capi-context'
import { metaEventIds } from './event-ids'
import { toMetaPayload } from '@/lib/analytics-events'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'

const TOKEN = 'EAAB-secret-token-value'

function consentCookie(marketing: boolean) {
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, marketing }))}`
}

function baseEvent(overrides: Partial<MetaCapiEvent> = {}): MetaCapiEvent {
  return {
    name: 'Purchase',
    eventId: metaEventIds.purchase('order_123456'),
    context: {
      marketingConsent: true,
      ip: '203.0.113.9',
      userAgent: 'UA/1.0',
      fbp: 'fb.1.123.456',
      sourceUrl: 'https://gloval.ai/billing',
    },
    user: { email: '  Buyer@Example.COM ', phone: '0532 123 45 67', userId: 'user-1' },
    custom: { value: 99.9, currency: 'TRY' },
    ...overrides,
  }
}

function okFetch() {
  return vi.fn(async () => new Response('{}', { status: 200 }))
}

describe('meta capi sender', () => {
  beforeEach(() => {
    resetMetaCapiState()
    vi.stubEnv('META_CAPI_ENABLED', '1')
    vi.stubEnv('META_CAPI_ACCESS_TOKEN', TOKEN)
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1234567890123')
    vi.stubEnv('META_CAPI_TEST_EVENT_CODE', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends hashed PII with the token only in the Authorization header', async () => {
    const fetchMock = okFetch()
    const result = await sendMetaCapiEvent(baseEvent(), { fetch: fetchMock as unknown as typeof fetch })
    expect(result).toEqual({ sent: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain(TOKEN)
    expect(url).toContain('/1234567890123/events')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    const raw = String(init.body)
    expect(raw).not.toContain('buyer@example.com')
    expect(raw).not.toContain('5321234567')
    expect(raw).not.toContain(TOKEN)
    const payload = JSON.parse(raw).data[0]
    expect(payload.event_id).toBe('purchase:order_123456')
    expect(payload.user_data.em).toEqual([sha256Hex('buyer@example.com')])
    expect(payload.user_data.ph).toEqual([sha256Hex('905321234567')])
    expect(payload.action_source).toBe('website')
  })

  it('does nothing when disabled, tokenless or without marketing consent', async () => {
    const fetchMock = okFetch()
    const deps = { fetch: fetchMock as unknown as typeof fetch }
    expect(await sendMetaCapiEvent(baseEvent({ context: { marketingConsent: false } }), deps)).toEqual({
      sent: false,
      reason: 'no_consent',
    })
    vi.stubEnv('META_CAPI_ACCESS_TOKEN', '')
    expect(await sendMetaCapiEvent(baseEvent(), deps)).toEqual({ sent: false, reason: 'no_token' })
    vi.stubEnv('META_CAPI_ACCESS_TOKEN', TOKEN)
    vi.stubEnv('META_CAPI_ENABLED', '0')
    expect(await sendMetaCapiEvent(baseEvent(), deps)).toEqual({ sent: false, reason: 'disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses events whose source page is not a measured surface', async () => {
    const fetchMock = okFetch()
    const event = baseEvent({ context: { ...baseEvent().context, sourceUrl: 'https://gloval.ai/auth/login' } })
    expect(await sendMetaCapiEvent(event, { fetch: fetchMock as unknown as typeof fetch })).toEqual({
      sent: false,
      reason: 'bad_source_url',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws or leaks the token when Meta fails or the network drops', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const http = vi.fn(async () => new Response(`bad ${TOKEN}`, { status: 400 }))
    expect(await sendMetaCapiEvent(baseEvent(), { fetch: http as unknown as typeof fetch })).toEqual({
      sent: false,
      reason: 'http_error',
    })
    const down = vi.fn(async () => {
      throw new Error(`connect failed ${TOKEN}`)
    })
    expect(await sendMetaCapiEvent(baseEvent({ eventId: 'purchase:other_1' }), { fetch: down as unknown as typeof fetch })).toEqual({
      sent: false,
      reason: 'network_error',
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
  })

  it('skips an event ID it already delivered', async () => {
    const fetchMock = okFetch()
    const deps = { fetch: fetchMock as unknown as typeof fetch }
    await sendMetaCapiEvent(baseEvent(), deps)
    expect(await sendMetaCapiEvent(baseEvent(), deps)).toEqual({ sent: false, reason: 'duplicate' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalises identifiers before hashing', () => {
    expect(normalizeEmail('  A@B.co ')).toBe('a@b.co')
    expect(normalizePhone('+90 (532) 123-45-67')).toBe('905321234567')
    expect(normalizePhone('5321234567')).toBe('905321234567')
    expect(normalizePhone('abc')).toBeNull()
    expect(buildUserData({ marketingConsent: true }, undefined)).toEqual({})
  })
})

describe('meta capi consent and event ids', () => {
  it('reads marketing consent from the cookie and fails closed', () => {
    expect(hasMarketingConsent(consentCookie(true))).toBe(true)
    expect(hasMarketingConsent(consentCookie(false))).toBe(false)
    expect(hasMarketingConsent(`${CONSENT_COOKIE}=not-json`)).toBe(false)
    expect(hasMarketingConsent(null)).toBe(false)
  })

  it('copies identifiers only when consent exists', () => {
    const base = { 'user-agent': 'UA', 'x-forwarded-for': '198.51.100.7', referer: 'https://gloval.ai/pricing' }
    const without = buildCapiContext(new Headers(base), { fallbackOrigin: 'https://gloval.ai' })
    expect(without).toEqual({ marketingConsent: false })
    const withConsent = buildCapiContext(
      new Headers({ ...base, cookie: `${consentCookie(true)}; _fbp=fb.1.1.2` }),
      { fallbackOrigin: 'https://gloval.ai' },
    )
    expect(withConsent).toMatchObject({
      marketingConsent: true,
      ip: '198.51.100.7',
      userAgent: 'UA',
      fbp: 'fb.1.1.2',
      sourceUrl: 'https://gloval.ai/pricing',
    })
  })

  it('uses the same event ID in the browser Pixel and the server', () => {
    const browser = toMetaPayload('purchase', { transaction_id: 'order_123456', value: 1, currency: 'TRY' })
    expect(browser.eventId).toBe(metaEventIds.purchase('order_123456'))
    const other = toMetaPayload('sign_up', { method: 'email', event_id: metaEventIds.signup('u-1') })
    expect(other.eventId).toBe(metaEventIds.signup('u-1'))
  })
})
