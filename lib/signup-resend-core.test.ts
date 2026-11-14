import { describe, expect, it, vi } from 'vitest'
import {
  RESEND_GENERIC_RESPONSE,
  buildResendRedirect,
  buildResendRules,
  resendSignupVerificationCore,
  type ResendDeps,
} from '@/lib/signup-resend-core'
import { cooldownRemainingSeconds } from '@/lib/signup-pending-verification'

function makeDeps(overrides: Partial<ResendDeps> = {}): ResendDeps {
  return {
    isRateLimited: vi.fn().mockResolvedValue(false),
    sendVerification: vi.fn().mockResolvedValue(undefined),
    clientIp: '203.0.113.7',
    callbackBase: 'https://gloval.ai/auth/callback',
    ...overrides,
  }
}

describe('resendSignupVerificationCore', () => {
  it('sends the e-mail and answers with the generic response', async () => {
    const deps = makeDeps()
    const result = await resendSignupVerificationCore(deps, { email: ' User@Example.com ' })
    expect(result).toEqual(RESEND_GENERIC_RESPONSE)
    expect(deps.sendVerification).toHaveBeenCalledWith('user@example.com', 'https://gloval.ai/auth/callback')
  })

  it('answers identically when rate limited, without sending', async () => {
    const deps = makeDeps({ isRateLimited: vi.fn().mockResolvedValue(true) })
    const result = await resendSignupVerificationCore(deps, { email: 'user@example.com' })
    expect(result).toEqual(RESEND_GENERIC_RESPONSE)
    expect(deps.sendVerification).not.toHaveBeenCalled()
  })

  it('answers identically for malformed input, without sending', async () => {
    const deps = makeDeps()
    expect(await resendSignupVerificationCore(deps, { email: 'nope' })).toEqual(RESEND_GENERIC_RESPONSE)
    expect(await resendSignupVerificationCore(deps, { email: 42 })).toEqual(RESEND_GENERIC_RESPONSE)
    expect(deps.sendVerification).not.toHaveBeenCalled()
  })

  it('swallows provider failures so account existence cannot be inferred', async () => {
    const deps = makeDeps({ sendVerification: vi.fn().mockRejectedValue(new Error('User not found')) })
    await expect(resendSignupVerificationCore(deps, { email: 'user@example.com' })).resolves.toEqual(
      RESEND_GENERIC_RESPONSE,
    )
  })
})

describe('buildResendRules', () => {
  it('limits per e-mail (cooldown + hourly) and per IP', () => {
    const rules = buildResendRules('user@example.com', '203.0.113.7')
    expect(rules.map((r) => r.name)).toEqual([
      'signup-resend-email',
      'signup-resend-email-hour',
      'signup-resend-ip-hour',
    ])
    expect(rules[0]).toMatchObject({ limit: 1, windowSeconds: 60 })
  })

  it('falls back to a shared bucket when the IP is unknown', () => {
    expect(buildResendRules('a@b.co', null)[2].key).toBe('unknown')
  })
})

describe('buildResendRedirect', () => {
  it('drops unsafe next paths and malformed drafts', () => {
    const url = buildResendRedirect('https://gloval.ai/auth/callback', 'https://evil.example', 'not a token')
    expect(url).toBe('https://gloval.ai/auth/callback')
  })

  it('keeps a safe next path', () => {
    const url = new URL(buildResendRedirect('https://gloval.ai/auth/callback', '/billing', undefined))
    expect(url.searchParams.get('next')).toBe('/billing')
  })
})

describe('cooldownRemainingSeconds', () => {
  it('counts down and never goes negative', () => {
    expect(cooldownRemainingSeconds(1_000, 1_000)).toBe(60)
    expect(cooldownRemainingSeconds(1_000, 31_000)).toBe(30)
    expect(cooldownRemainingSeconds(1_000, 500_000)).toBe(0)
  })
})
