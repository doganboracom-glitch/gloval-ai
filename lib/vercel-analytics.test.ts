import { describe, expect, it } from 'vitest'
import { isVercelAnalyticsActive, resolveAnalyticsMode } from './vercel-analytics'

const granted = { necessary: true, analytics: true, marketing: false } as const
const denied = { necessary: true, analytics: false, marketing: false } as const

describe('resolveAnalyticsMode', () => {
  it('defaults to consent', () => {
    expect(resolveAnalyticsMode(undefined)).toBe('consent')
    expect(resolveAnalyticsMode('')).toBe('consent')
    expect(resolveAnalyticsMode('nonsense')).toBe('consent')
  })

  it('accepts "always" case-insensitively', () => {
    expect(resolveAnalyticsMode('always')).toBe('always')
    expect(resolveAnalyticsMode(' ALWAYS ')).toBe('always')
  })
})

describe('isVercelAnalyticsActive', () => {
  const host = 'gloval.ai'

  it('consent mode requires the analytics category', () => {
    expect(isVercelAnalyticsActive({ mode: 'consent', consent: null, hostname: host, pathname: '/' })).toBe(false)
    expect(isVercelAnalyticsActive({ mode: 'consent', consent: denied, hostname: host, pathname: '/' })).toBe(false)
    expect(isVercelAnalyticsActive({ mode: 'consent', consent: granted, hostname: host, pathname: '/' })).toBe(true)
  })

  it('consent mode keeps excluding every auth route', () => {
    for (const pathname of ['/auth/sign-up', '/auth/login', '/auth/confirm']) {
      expect(isVercelAnalyticsActive({ mode: 'consent', consent: granted, hostname: host, pathname })).toBe(false)
    }
  })

  it('always mode loads without a consent choice on platform pages', () => {
    expect(isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: host, pathname: '/' })).toBe(true)
    expect(isVercelAnalyticsActive({ mode: 'always', consent: denied, hostname: host, pathname: '/' })).toBe(true)
  })

  it('always mode measures only the sign-up / login entry screens among auth routes', () => {
    expect(isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: host, pathname: '/auth/sign-up' })).toBe(true)
    expect(isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: host, pathname: '/auth/login' })).toBe(true)
    expect(isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: host, pathname: '/auth/confirm' })).toBe(false)
    expect(isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: host, pathname: '/forgot-password' })).toBe(false)
  })

  it('always mode never measures published customer sites', () => {
    expect(
      isVercelAnalyticsActive({ mode: 'always', consent: null, hostname: 'acme.gloval.site', pathname: '/' }),
    ).toBe(false)
  })
})
