// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'

const trackMock = vi.hoisted(() => vi.fn())
vi.mock('@vercel/analytics', () => ({ track: trackMock }))

import {
  isVercelAnalyticsActive,
  resolveAnalyticsMode,
  trackFunnelEvent,
  VERCEL_FUNNEL_EVENTS,
} from './vercel-analytics'

const granted = { necessary: true, analytics: true, marketing: false } as const
const denied = { necessary: true, analytics: false, marketing: false } as const

describe('fixed funnel event names', () => {
  it('uses fixed event names and non-identifying campaign labels', () => {
    expect(VERCEL_FUNNEL_EVENTS.campaignWhatsappClick).toBe('campaign_whatsapp_click')
    expect(VERCEL_FUNNEL_EVENTS.campaignSignupClick).toBe('campaign_signup_click')
    expect(VERCEL_FUNNEL_EVENTS.campaignPricingClick).toBe('campaign_pricing_click')
    expect(VERCEL_FUNNEL_EVENTS.campaignFaqClick).toBe('campaign_faq_click')
    expect(VERCEL_FUNNEL_EVENTS.campaignDemoClick).toBe('campaign_demo_click')
    expect(VERCEL_FUNNEL_EVENTS.signupError).toBe('signup_error')
  })
})

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

describe('trackFunnelEvent', () => {
  afterEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`
    window.history.replaceState({}, '', '/')
    vi.unstubAllEnvs()
    trackMock.mockReset()
  })

  it('sends first-touch labels and deduplicates a stable occurrence key', () => {
    vi.stubEnv('NODE_ENV', 'production')
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({
      v: CONSENT_VERSION,
      necessary: true,
      analytics: true,
      marketing: false,
    }))}; path=/`

    expect(
      trackFunnelEvent(
        VERCEL_FUNNEL_EVENTS.landingView,
        { utm_content: 'hero', landing_path: '/paketler' },
        'landing-view-1',
      ),
    ).toBe(true)
    trackFunnelEvent(
      VERCEL_FUNNEL_EVENTS.landingView,
      { utm_content: 'hero', landing_path: '/paketler' },
      'landing-view-1',
    )

    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('landing_view', {
      utm_source: 'direct',
      utm_medium: 'direct',
      utm_campaign: 'direct',
      utm_content: 'hero',
      landing_path: '/paketler',
    })
  })

  it('filters personal-looking labels and swallows vendor failures', () => {
    vi.stubEnv('NODE_ENV', 'production')
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({
      v: CONSENT_VERSION,
      necessary: true,
      analytics: true,
      marketing: false,
    }))}; path=/`
    trackMock.mockImplementation(() => {
      throw new Error('analytics unavailable')
    })

    expect(() =>
      trackFunnelEvent(
        VERCEL_FUNNEL_EVENTS.landingView,
        { utm_source: 'ada@example.com', landing_path: '/u/123456789' },
        'landing-view-2',
      ),
    ).not.toThrow()
  })
})
