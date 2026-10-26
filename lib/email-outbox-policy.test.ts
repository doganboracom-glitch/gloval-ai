import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  backoffMs,
  classifyHttpFailure,
  decideRetry,
  sanitizeErrorCode,
} from '@/lib/email-outbox-policy'

describe('email outbox policy', () => {
  it('grows the wait between attempts and caps at the last step', () => {
    expect(backoffMs(1)).toBe(60_000)
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1))
    expect(backoffMs(5)).toBe(3 * 60 * 60_000)
    expect(backoffMs(99)).toBe(backoffMs(5))
  })

  it('retries 429, 5xx and network errors but not other 4xx', () => {
    expect(classifyHttpFailure(429).retryable).toBe(true)
    expect(classifyHttpFailure(503).retryable).toBe(true)
    expect(classifyHttpFailure(409).retryable).toBe(true)
    expect(classifyHttpFailure(null)).toEqual({ retryable: true, code: 'network_error' })
    expect(classifyHttpFailure(422)).toEqual({ retryable: false, code: 'http_422' })
    expect(classifyHttpFailure(401).retryable).toBe(false)
  })

  it('schedules a retry until the sixth attempt, then fails', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const first = decideRetry(1, 'http_503', now)
    expect(first).toEqual({ action: 'retry', nextAttemptAt: new Date(now.getTime() + 60_000) })
    expect(decideRetry(MAX_ATTEMPTS - 1, 'http_503', now).action).toBe('retry')
    expect(decideRetry(MAX_ATTEMPTS, 'http_503', now)).toEqual({ action: 'fail', code: 'max_attempts' })
  })

  it('never lets free text or an address into last_error', () => {
    expect(sanitizeErrorCode('http_429')).toBe('http_429')
    expect(sanitizeErrorCode('user@example.com')).toBe('unknown_error')
    expect(sanitizeErrorCode('Bearer re_abc123')).toBe('unknown_error')
  })
})
