import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  paid: true,
  retrieveThrows: false,
  outcome: 'subscription' as string,
  raw: { paidPrice: 299.9, currency: 'TRY', basketId: 'order_ABC123' } as Record<string, unknown>,
  sent: [] as Array<{ eventId: string; custom?: Record<string, unknown>; context: { marketingConsent: boolean } }>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null }),
    }
    return { from: () => chain, auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } } }
  },
}))
vi.mock('@/lib/payments/domain-e2e-mode', () => ({ isDomainE2ETestModeEnabled: () => false }))
vi.mock('@/lib/payments/iyzico', () => ({
  retrieveIyzicoCheckoutForm: async () => {
    if (state.retrieveThrows) throw new Error('iyzico down')
    return { paid: state.paid, status: state.paid ? 'SUCCESS' : 'FAILURE', raw: state.raw }
  },
}))
vi.mock('@/lib/payments/settle', () => ({
  settlePaymentResult: async () => state.outcome,
}))
vi.mock('@/lib/analytics/meta-capi', () => ({
  runInBackground: (work: () => Promise<unknown>) => void work(),
  sendMetaCapiEvent: async (event: { eventId: string; custom?: Record<string, unknown>; context: { marketingConsent: boolean } }) => {
    state.sent.push(event)
    return { sent: true }
  },
}))

import { GET, POST } from './route'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'

const ORIGIN = 'https://gloval.ai'

function consentCookie(marketing: boolean) {
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, marketing }))}`
}

function callback(options: { marketing?: boolean; method?: 'POST' | 'GET' } = {}) {
  const { marketing = true, method = 'POST' } = options
  const request = new Request(`${ORIGIN}/api/billing/checkout/iyzico/callback?token=tok_abcdefghijklmnop`, {
    method,
    headers: { cookie: consentCookie(marketing), 'user-agent': 'UA/1.0', 'x-forwarded-for': '198.51.100.7' },
  })
  return method === 'POST' ? POST(request) : GET(request)
}

function fallbackUrl(html: string): URL {
  const match = html.match(/window\.location\.replace\(("[^"]+")\)/)
  expect(match).not.toBeNull()
  return new URL(JSON.parse(match![1]))
}

describe('iyzico callback purchase measurement', () => {
  beforeEach(() => {
    state.paid = true
    state.retrieveThrows = false
    state.outcome = 'subscription'
    state.raw = { paidPrice: 299.9, currency: 'TRY', basketId: 'order_ABC123' }
    state.sent = []
  })

  it('adds gl_* parameters and sends a Purchase only for a verified, settled payment', async () => {
    const res = await callback()
    const html = await res.text()
    const url = fallbackUrl(html)
    expect(url.pathname).toBe('/payment-result')
    expect(url.searchParams.get('checkout')).toBe('success')
    expect(url.searchParams.get('gl_tx')).toBe('order_ABC123')
    expect(url.searchParams.get('gl_v')).toBe('299.9')
    expect(url.searchParams.get('gl_c')).toBe('TRY')
    expect(url.searchParams.get('gl_k')).toBe('subscription')
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].eventId).toBe('purchase:order_ABC123')
    expect(state.sent[0].custom).toMatchObject({ value: 299.9, currency: 'TRY' })
  })

  it('emits nothing when iyzico reports the payment as failed', async () => {
    state.paid = false
    state.outcome = 'no_match'
    const html = await (await callback()).text()
    const url = fallbackUrl(html)
    expect(url.searchParams.get('checkout')).toBe('failed')
    expect([...url.searchParams.keys()].filter((k) => k.startsWith('gl_'))).toEqual([])
    expect(html).not.toContain('"purchase"')
    expect(state.sent).toHaveLength(0)
  })

  it('emits nothing when the charged amount did not match the order', async () => {
    state.outcome = 'payment_rejected'
    const html = await (await callback()).text()
    const url = fallbackUrl(html)
    expect(url.searchParams.get('checkout')).toBe('failed')
    expect(url.searchParams.has('gl_tx')).toBe(false)
    expect(state.sent).toHaveLength(0)
  })

  it('emits nothing when verification with iyzico itself fails', async () => {
    state.retrieveThrows = true
    const html = await (await callback()).text()
    expect(fallbackUrl(html).searchParams.get('checkout')).toBe('error')
    expect(state.sent).toHaveLength(0)
  })

  it('emits nothing for an outcome that is not a purchase (e.g. renewal)', async () => {
    state.outcome = 'renewal'
    const html = await (await callback()).text()
    expect(fallbackUrl(html).searchParams.has('gl_tx')).toBe(false)
    expect(state.sent).toHaveLength(0)
  })

  it('skips the server event without marketing consent but still returns the result', async () => {
    const res = await callback({ marketing: false })
    expect(res.status).toBe(200)
    expect(state.sent).toHaveLength(0)
  })

  it('reuses the same event ID when the callback is replayed (POST then GET)', async () => {
    await callback({ method: 'POST' })
    await callback({ method: 'GET' })
    expect(state.sent.map((e) => e.eventId)).toEqual(['purchase:order_ABC123', 'purchase:order_ABC123'])
  })

  it('derives a stable ID from the token when iyzico gives no order reference', async () => {
    state.raw = { paidPrice: 10, currency: 'TRY' }
    await callback()
    await callback()
    expect(state.sent).toHaveLength(2)
    expect(state.sent[0].eventId).toBe(state.sent[1].eventId)
    expect(state.sent[0].eventId).toMatch(/^purchase:[0-9a-f]{32}$/)
  })
})
