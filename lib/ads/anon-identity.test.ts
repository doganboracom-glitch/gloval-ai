import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { ADS_ANON_COOKIE_MAX_AGE_SECONDS, issueAnonCookie, verifyAnonCookie } from '@/lib/ads/anon-identity'
import { clientIpFromHeaders, networkKeyForIp } from '@/lib/ads/client-ip'
import { suggestBudget } from '@/lib/ads/budget'
import { estimateCostMicroUsd } from '@/lib/ads/model-pricing'
import { ADS_SCAN_ERROR_STATUS, adsScanErrorBody } from '@/lib/ads/public-errors'

const ENV = { ADS_ANON_HASH_SECRET: 'x'.repeat(40) }
const NOW = 1_800_000_000_000

describe('anonymous cookie', () => {
  it('round-trips an issued cookie', () => {
    const issued = issueAnonCookie(ENV, NOW)!
    expect(verifyAnonCookie(issued.value, ENV, NOW + 5_000)).toEqual({ status: 'valid', id: issued.id })
  })

  it('fails closed without a secret', () => {
    expect(issueAnonCookie({}, NOW)).toBeNull()
    expect(verifyAnonCookie('anything', {}, NOW)).toEqual({ status: 'unconfigured' })
  })

  it('reports missing, tampered, foreign-secret, future and expired cookies', () => {
    const issued = issueAnonCookie(ENV, NOW)!
    expect(verifyAnonCookie(undefined, ENV, NOW)).toEqual({ status: 'missing' })
    expect(verifyAnonCookie(issued.value.slice(0, -2) + 'zz', ENV, NOW)).toEqual({ status: 'invalid' })
    expect(verifyAnonCookie(issued.value, { ADS_ANON_HASH_SECRET: 'y'.repeat(40) }, NOW)).toEqual({ status: 'invalid' })
    expect(verifyAnonCookie(issued.value, ENV, NOW - 600_000)).toEqual({ status: 'invalid' })
    expect(verifyAnonCookie(issued.value, ENV, NOW + (ADS_ANON_COOKIE_MAX_AGE_SECONDS + 10) * 1000)).toEqual({
      status: 'invalid',
    })
    expect(verifyAnonCookie('a.b', ENV, NOW)).toEqual({ status: 'invalid' })
  })
})

describe('client ip', () => {
  it('keeps IPv4, folds IPv6 to /64 and unmaps IPv4-mapped addresses', () => {
    expect(networkKeyForIp('203.0.113.7')).toBe('203.0.113.7')
    expect(networkKeyForIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64')
    expect(networkKeyForIp('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(networkKeyForIp('not-an-ip')).toBeNull()
    expect(networkKeyForIp('')).toBeNull()
  })

  it('prefers the Vercel header and falls back to the first forwarded hop', () => {
    const headers = (entries: Record<string, string>) => new Headers(entries)
    expect(clientIpFromHeaders(headers({ 'x-vercel-forwarded-for': '198.51.100.9', 'x-forwarded-for': '203.0.113.1' }))).toBe('198.51.100.9')
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }))).toBe('203.0.113.1')
    expect(clientIpFromHeaders(headers({}))).toBeNull()
  })
})

describe('budget, pricing and public errors', () => {
  it('suggests the approved budget table', () => {
    expect(suggestBudget('low')).toMatchObject({ daily: 150, maxDaily: 300, maxMonthly: 4560 })
    expect(suggestBudget('medium')).toMatchObject({ daily: 300, maxDaily: 600, maxMonthly: 9120 })
    expect(suggestBudget('high')).toMatchObject({ daily: 600, maxDaily: 1200, maxMonthly: 18240 })
  })

  it('estimates cost only for priced models', () => {
    expect(estimateCostMicroUsd('anthropic/claude-opus-5.5', { inputTokens: 1000, outputTokens: 1000 })).toBe(90_000)
    expect(estimateCostMicroUsd('unknown/model', { inputTokens: 1, outputTokens: 1 })).toBeNull()
  })

  it('exposes only code and typed extras', () => {
    expect(adsScanErrorBody({ code: 'unreachable' })).toEqual({ error: { code: 'unreachable' } })
    expect(adsScanErrorBody({ code: 'credits_required', balance: 1 })).toEqual({ error: { code: 'credits_required', balance: 1 } })
    expect(ADS_SCAN_ERROR_STATUS.session_required).toBe(428)
  })
})
