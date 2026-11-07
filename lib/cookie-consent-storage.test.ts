import { describe, expect, it } from 'vitest'
import { buildConsentCookie, CONSENT_COOKIE, CONSENT_VERSION, readConsent } from './cookie-consent-storage'
import { hasMarketingConsent } from '@/lib/analytics/meta-capi-context'

const choice = { necessary: true as const, analytics: true, marketing: true }

describe('consent cookie attributes', () => {
  it('is SameSite=None; Secure over HTTPS so iyzico\'s cross-site POST carries it', () => {
    const cookie = buildConsentCookie(choice, 'https:')
    expect(cookie).toContain('samesite=none')
    expect(cookie).toContain('secure')
    expect(cookie).not.toContain('samesite=lax')
  })

  it('stays Lax and non-Secure over plain HTTP, where Secure cookies cannot be set', () => {
    const cookie = buildConsentCookie(choice, 'http:')
    expect(cookie).toContain('samesite=lax')
    expect(cookie).not.toContain('secure')
    expect(cookie).not.toContain('samesite=none')
  })

  it('keeps path, six-month lifetime and no HttpOnly (the client must read it)', () => {
    const cookie = buildConsentCookie(choice, 'https:')
    expect(cookie).toContain('path=/')
    expect(cookie).toContain('max-age=15552000')
    expect(cookie.toLowerCase()).not.toContain('httponly')
  })

  it('round-trips through the browser reader and the server reader', () => {
    const cookie = buildConsentCookie(choice, 'https:')
    const pair = cookie.split(';')[0]
    expect(pair.startsWith(`${CONSENT_COOKIE}=`)).toBe(true)
    expect(readConsent({ cookie: pair } as Document)).toEqual(choice)
    expect(hasMarketingConsent(pair)).toBe(true)
    expect(hasMarketingConsent(buildConsentCookie({ ...choice, marketing: false }, 'https:').split(';')[0])).toBe(false)
    expect(JSON.parse(decodeURIComponent(pair.split('=')[1])).v).toBe(CONSENT_VERSION)
  })
})
