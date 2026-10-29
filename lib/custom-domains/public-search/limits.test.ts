import { describe, expect, it } from 'vitest'
import {
  PUBLIC_SEARCH_LIMITS,
  STRIKE_WINDOW,
  checkBlocked,
  checkSearchLimits,
  identityFor,
  resolveRateLimitIp,
  type LimiterDeps,
} from './limits'

function memoryLimiter(): LimiterDeps & { counts: Map<string, number> } {
  const counts = new Map<string, number>()
  return {
    counts,
    async reserve(subject, limit) {
      const next = (counts.get(subject) ?? 0) + 1
      if (next > limit) return { allowed: false }
      counts.set(subject, next)
      return { allowed: true }
    },
    async release(subject) {
      counts.set(subject, Math.max(0, (counts.get(subject) ?? 1) - 1))
    },
  }
}

describe('resolveRateLimitIp', () => {
  const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null

  it('prefers cf-connecting-ip, then x-real-ip, then the first forwarded hop', () => {
    expect(resolveRateLimitIp(headers({ 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '5.6.7.8' }))).toBe('1.2.3.4')
    expect(resolveRateLimitIp(headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    expect(resolveRateLimitIp(headers({ 'x-vercel-forwarded-for': '9.9.9.9, 1.1.1.1' }))).toBe('9.9.9.9')
  })

  it('rejects junk values', () => {
    expect(resolveRateLimitIp(headers({ 'x-real-ip': '<script>' }))).toBeNull()
    expect(resolveRateLimitIp(headers({}))).toBeNull()
  })
})

describe('identityFor', () => {
  it('never embeds the raw ip or user id', () => {
    expect(identityFor(null, '1.2.3.4').key).not.toContain('1.2.3.4')
    expect(identityFor('user-123', null).key).not.toContain('user-123')
    expect(identityFor('u', null).kind).toBe('user')
    expect(identityFor(null, null).kind).toBe('anon')
  })
})

describe('checkSearchLimits', () => {
  it('allows the per-minute budget then refuses without consuming more', async () => {
    const limiter = memoryLimiter()
    const id = identityFor(null, '1.2.3.4')
    const perMinute = PUBLIC_SEARCH_LIMITS.anon[0].limit
    for (let i = 0; i < perMinute; i += 1) expect((await checkSearchLimits(id, limiter)).ok).toBe(true)
    const verdict = await checkSearchLimits(id, limiter)
    expect(verdict).toMatchObject({ ok: false, reason: 'RATE_LIMITED' })
  })

  it('fails closed when the counter is unreachable', async () => {
    const down: LimiterDeps = { reserve: async () => null, release: async () => {} }
    expect(await checkSearchLimits(identityFor(null, '1.2.3.4'), down)).toEqual({ ok: false, reason: 'UNAVAILABLE' })
    expect(await checkBlocked(identityFor(null, '1.2.3.4'), down)).toEqual({ ok: false, reason: 'UNAVAILABLE' })
  })
})

describe('checkBlocked', () => {
  it('peeks without consuming and blocks once strikes hit the limit', async () => {
    const limiter = memoryLimiter()
    const id = identityFor(null, '1.2.3.4')
    for (let i = 0; i < 50; i += 1) expect((await checkBlocked(id, limiter)).ok).toBe(true)
    for (let i = 0; i < STRIKE_WINDOW.limit; i += 1) await limiter.reserve(`domsearch:strike:${id.key}`, STRIKE_WINDOW.limit, 600)
    expect(await checkBlocked(id, limiter)).toMatchObject({ ok: false, reason: 'RATE_LIMITED' })
  })
})
