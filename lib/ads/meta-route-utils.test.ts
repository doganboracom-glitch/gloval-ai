import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/request-user', () => ({
  AuthUnavailableError: class AuthUnavailableError extends Error {},
  getRequestUser: vi.fn(),
}))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))

import { isSameOriginMetaAdsPost } from './meta-route-utils'

const URL_ = 'https://gloval.ai/api/ads/meta/connect'

function post(headers: Record<string, string> = {}): Request {
  return new Request(URL_, { method: 'POST', headers })
}

describe('isSameOriginMetaAdsPost', () => {
  it('accepts a same-origin Origin header', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'https://gloval.ai' }))).toBe(true)
  })

  it('rejects a different Origin header', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'https://evil.example' }))).toBe(false)
  })

  it('rejects a different Origin even when Sec-Fetch-Site claims same-origin', () => {
    expect(
      isSameOriginMetaAdsPost(post({ origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' })),
    ).toBe(false)
  })

  it('accepts Origin: null with Sec-Fetch-Site: same-origin (no-referrer auth pages)', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'null', 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('rejects Origin: null with Sec-Fetch-Site: cross-site', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'null', 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('rejects Origin: null with Sec-Fetch-Site: same-site or none', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'null', 'sec-fetch-site': 'same-site' }))).toBe(false)
    expect(isSameOriginMetaAdsPost(post({ origin: 'null', 'sec-fetch-site': 'none' }))).toBe(false)
  })

  it('rejects Origin: null without Sec-Fetch-Site', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'null' }))).toBe(false)
  })

  it('accepts a missing Origin with Sec-Fetch-Site: same-origin', () => {
    expect(isSameOriginMetaAdsPost(post({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
  })

  it('rejects a request with no Origin and no Sec-Fetch-Site', () => {
    expect(isSameOriginMetaAdsPost(post())).toBe(false)
  })

  it('rejects a malformed Origin', () => {
    expect(isSameOriginMetaAdsPost(post({ origin: 'not a url', 'sec-fetch-site': 'same-origin' }))).toBe(false)
  })
})
