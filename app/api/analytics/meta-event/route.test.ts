import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; phone?: string } | null,
  ownsProject: true,
  rateAllowed: true,
  sent: [] as Array<Record<string, unknown>>,
  rateKeys: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: state.ownsProject ? { id: 'x' } : null }),
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: null }, error: { message: 'none' } }),
      },
    },
  }),
}))
vi.mock('@/lib/store-auth-rate-limit', () => ({
  hitRateLimit: async (rule: { key: string }) => {
    state.rateKeys.push(rule.key)
    return state.rateAllowed
      ? { allowed: true, retryAfterSeconds: 0 }
      : { allowed: false, retryAfterSeconds: 42 }
  },
}))
vi.mock('@/lib/analytics/meta-capi', () => ({
  runInBackground: (work: () => Promise<unknown>) => void work(),
  sendMetaCapiEvent: async (event: Record<string, unknown>) => {
    state.sent.push(event)
    return { sent: true }
  },
}))
vi.mock('@/lib/analytics/meta-capi-purchase', () => ({
  loadCapiUser: async () => undefined,
}))

import { POST } from './route'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'

const ORIGIN = 'https://gloval.ai'
const NONCE = 'nonce-12345678'
const SITE_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'

function consent(marketing: boolean) {
  return `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, marketing }))}`
}

function post(
  body: unknown,
  options: { marketing?: boolean; headers?: Record<string, string>; raw?: string } = {},
) {
  const { marketing = true, headers = {}, raw } = options
  return POST(
    new Request(`${ORIGIN}/api/analytics/meta-event`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        cookie: consent(marketing),
        'x-forwarded-for': '198.51.100.7',
        'content-type': 'application/json',
        ...headers,
      },
      body: raw ?? JSON.stringify(body),
    }),
  )
}

describe('meta-event bridge route', () => {
  beforeEach(() => {
    state.user = null
    state.ownsProject = true
    state.rateAllowed = true
    state.sent = []
    state.rateKeys = []
  })

  it('does nothing without marketing consent: no rate limit, no send', async () => {
    const res = await post({ type: 'generate_site_completed', nonce: NONCE }, { marketing: false })
    expect(res.status).toBe(202)
    expect(state.sent).toHaveLength(0)
    expect(state.rateKeys).toHaveLength(0)
  })

  it('rejects a cross-origin caller', async () => {
    const res = await post({ type: 'generate_site_completed', nonce: NONCE }, { headers: { origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
    expect(state.sent).toHaveLength(0)
  })

  it('returns 429 with Retry-After when the per-IP limit is hit', async () => {
    state.rateAllowed = false
    const res = await post({ type: 'generate_site_completed', nonce: NONCE })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('42')
    expect(state.sent).toHaveLength(0)
  })

  it('keys the limit on the client network, not a spoofable body field', async () => {
    await post({ type: 'generate_site_completed', nonce: NONCE })
    expect(state.rateKeys).toEqual(['198.51.100.7'])
  })

  it('rejects oversized bodies, declared or actual', async () => {
    const declared = await post({}, { headers: { 'content-length': '999999' }, raw: '{}' })
    expect(declared.status).toBe(413)
    const padded = JSON.stringify({ type: 'generate_site_completed', nonce: NONCE, pad: 'x'.repeat(4000) })
    const actual = await post(null, { raw: padded, headers: { 'content-length': '10' } })
    expect(actual.status).toBe(413)
    expect(state.sent).toHaveLength(0)
  })

  it('rejects malformed or non-object JSON', async () => {
    expect((await post(null, { raw: '{not json' })).status).toBe(400)
    expect((await post([1, 2])).status).toBe(400)
    expect((await post({ type: 'purchase', nonce: NONCE })).status).toBe(400)
  })

  describe('generate_site_completed', () => {
    it('is accepted anonymously: the homepage generator needs no session', async () => {
      const res = await post({ type: 'generate_site_completed', nonce: NONCE })
      expect(res.status).toBe(202)
      expect(state.sent).toHaveLength(1)
      expect(state.sent[0]).toMatchObject({ name: 'GenerateSiteCompleted', eventId: `generate:${NONCE}` })
      expect(state.sent[0].user).toBeUndefined()
    })

    it('requires a well-formed nonce', async () => {
      expect((await post({ type: 'generate_site_completed', nonce: 'short' })).status).toBe(400)
      expect((await post({ type: 'generate_site_completed' })).status).toBe(400)
    })
  })

  describe('begin_checkout', () => {
    const valid = { type: 'begin_checkout', nonce: NONCE, value: 299.9, currency: 'TRY', category: 'subscription' }

    it('requires a signed-in user', async () => {
      const res = await post(valid)
      expect(res.status).toBe(400)
      expect(state.sent).toHaveLength(0)
    })

    it('sends a validated event for a signed-in user', async () => {
      state.user = { id: 'user-1', email: 'a@b.co' }
      const res = await post(valid)
      expect(res.status).toBe(202)
      expect(state.sent[0]).toMatchObject({
        name: 'InitiateCheckout',
        eventId: `checkout:${NONCE}`,
        custom: { value: 299.9, currency: 'TRY', content_category: 'subscription' },
        user: { userId: 'user-1' },
      })
    })

    it.each([
      ['negative', -1],
      ['over the cap', 10_000_001],
      ['a string', '99'],
      ['NaN-like', null],
    ])('rejects a value that is %s', async (_label, value) => {
      state.user = { id: 'user-1', email: 'a@b.co' }
      const res = await post({ ...valid, value })
      expect(res.status).toBe(400)
      expect(state.sent).toHaveLength(0)
    })

    it('drops an unknown currency or category instead of forwarding it', async () => {
      state.user = { id: 'user-1', email: 'a@b.co' }
      await post({ ...valid, currency: 'try', category: 'anything' })
      expect(state.sent[0].custom).toEqual({ value: 299.9 })
    })
  })

  describe('publish_site', () => {
    it('requires a session and project ownership', async () => {
      expect((await post({ type: 'publish_site', siteId: SITE_ID })).status).toBe(400)
      state.user = { id: 'user-1', email: 'a@b.co' }
      state.ownsProject = false
      expect((await post({ type: 'publish_site', siteId: SITE_ID })).status).toBe(400)
      state.ownsProject = true
      expect((await post({ type: 'publish_site', siteId: SITE_ID })).status).toBe(202)
      expect(state.sent[0]).toMatchObject({ name: 'PublishSite', eventId: `publish:${SITE_ID}` })
    })
  })
})
