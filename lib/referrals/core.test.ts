import { describe, expect, it } from 'vitest'
import {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_SIGNUP_INTENT_TTL_SECONDS,
  createReferralCookieToken,
  createReferralSignupIntent,
  hashReferralClickSubject,
  hashReferralSignupNonce,
  isReferralRuntimeReady,
  normalizeReferralCode,
  verifyReferralCookieToken,
  verifyReferralSignupIntent,
  type ReferralEnvironment,
} from './core'

const NOW = Date.UTC(2026, 10, 3, 12)
const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const IP = '203.0.113.42'

const readyEnvironment: ReferralEnvironment = {
  REFERRAL_ENABLED: '1',
  REFERRAL_COOKIE_HMAC_ACTIVE_VERSION: 'v1',
  REFERRAL_COOKIE_HMAC_KEY_V1: 'cookie-secret-0123456789-abcdefghijkl',
  REFERRAL_CLICK_HMAC_KEY_V1: 'click-secret-0123456789-abcdefghijkl',
}

describe('referral configuration and code validation', () => {
  it('requires the explicit flag and all active-version secrets', () => {
    expect(isReferralRuntimeReady(readyEnvironment)).toBe(true)
    expect(isReferralRuntimeReady({ ...readyEnvironment, REFERRAL_ENABLED: 'true' })).toBe(false)
    expect(isReferralRuntimeReady({ ...readyEnvironment, REFERRAL_CLICK_HMAC_KEY_V1: undefined })).toBe(false)
    expect(isReferralRuntimeReady({ ...readyEnvironment, REFERRAL_COOKIE_HMAC_ACTIVE_VERSION: 'v2' })).toBe(false)
  })

  it('normalizes valid referral codes and rejects malformed values', () => {
    expect(normalizeReferralCode('  partner01 ')).toBe('PARTNER01')
    expect(normalizeReferralCode('TOO-SHORT')).toBeNull()
    expect(normalizeReferralCode('contains space')).toBeNull()
    expect(normalizeReferralCode(null)).toBeNull()
  })
})

describe('signed referral cookie', () => {
  it('verifies an untampered cookie and rejects a modified signature', async () => {
    const token = await createReferralCookieToken(
      { partnerId: PARTNER_ID, referralCode: 'partner01', capturedAt: NOW },
      readyEnvironment,
    )
    expect(token).not.toBeNull()
    await expect(verifyReferralCookieToken(token, NOW + 1, readyEnvironment)).resolves.toMatchObject({
      partnerId: PARTNER_ID,
      referralCode: 'PARTNER01',
      capturedAt: NOW,
      expiresAt: NOW + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000,
    })

    const tampered = `${token?.slice(0, -1)}${token?.endsWith('A') ? 'B' : 'A'}`
    await expect(verifyReferralCookieToken(tampered, NOW + 1, readyEnvironment)).resolves.toBeNull()
  })

  it('rejects cookies after their fixed first-touch expiry', async () => {
    const token = await createReferralCookieToken(
      { partnerId: PARTNER_ID, referralCode: 'PARTNER01', capturedAt: NOW },
      readyEnvironment,
    )
    await expect(
      verifyReferralCookieToken(
        token,
        NOW + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000,
        readyEnvironment,
      ),
    ).resolves.toBeNull()
  })
})

describe('signed signup intent and privacy hashes', () => {
  it('expires signup intents and binds their source', async () => {
    const intent = await createReferralSignupIntent('oauth', NOW, readyEnvironment)
    expect(intent).not.toBeNull()
    const claims = await verifyReferralSignupIntent(intent?.token, NOW + 1, readyEnvironment)
    expect(claims).toMatchObject({ source: 'oauth', issuedAt: NOW, expiresAt: NOW + REFERRAL_SIGNUP_INTENT_TTL_SECONDS * 1000 })
    await expect(
      verifyReferralSignupIntent(intent?.token, NOW + REFERRAL_SIGNUP_INTENT_TTL_SECONDS * 1000, readyEnvironment),
    ).resolves.toBeNull()
    await expect(hashReferralSignupNonce(claims?.nonce ?? '')).resolves.toBe(intent?.intentHash)
  })

  it('rotates click subject digests daily without returning the raw IP', async () => {
    const today = await hashReferralClickSubject(IP, NOW, readyEnvironment)
    const tomorrow = await hashReferralClickSubject(IP, NOW + 24 * 60 * 60 * 1000, readyEnvironment)
    expect(today).toMatch(/^[a-f0-9]{64}$/u)
    expect(tomorrow).toMatch(/^[a-f0-9]{64}$/u)
    expect(today).not.toBe(tomorrow)
    expect(today).not.toContain(IP)
    await expect(hashReferralClickSubject(null, NOW, readyEnvironment)).resolves.toBeNull()
  })
})
