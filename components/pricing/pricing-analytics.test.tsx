// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { Pricing } from '@/components/pricing'
import { isPricingSectionViewed } from '@/components/pricing/use-pricing-view-tracking'
import { readConsent } from '@/lib/cookie-consent-storage'

const trackMock = vi.hoisted(() => vi.fn())

vi.mock('@vercel/analytics', () => ({ track: trackMock }))
vi.mock('@/lib/cookie-consent-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cookie-consent-storage')>()),
  readConsent: vi.fn(),
}))

type ObserverCallback = (entries: Array<Record<string, unknown>>) => void

const observers: Array<{ callback: ObserverCallback; disconnected: boolean }> = []

class FakeIntersectionObserver {
  private readonly record: { callback: ObserverCallback; disconnected: boolean }
  constructor(callback: ObserverCallback) {
    this.record = { callback, disconnected: false }
    observers.push(this.record)
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return []
  }
  disconnect() {
    this.record.disconnected = true
  }
}

function reportVisibility(ratio: number, visibleHeight = 0) {
  for (const observer of observers) {
    if (observer.disconnected) continue
    observer.callback([
      {
        isIntersecting: ratio > 0 || visibleHeight > 0,
        intersectionRatio: ratio,
        intersectionRect: { height: visibleHeight },
        rootBounds: { height: 800 },
      },
    ])
  }
}

const granted = { necessary: true, analytics: true, marketing: false } as const
const denied = { necessary: true, analytics: false, marketing: false } as const

function renderPricing() {
  return render(
    <LanguageProvider initialLang="tr">
      <Pricing isAuthenticated={false} />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  window.matchMedia = ((media: string) =>
    ({
      matches: true,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  // Link clicks must not trigger jsdom navigation.
  document.addEventListener('click', (event) => event.preventDefault(), true)
  trackMock.mockClear()
  observers.length = 0
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isPricingSectionViewed', () => {
  it('counts half of the section or half of the viewport', () => {
    const base = { isIntersecting: true, rootBounds: { height: 800 } }
    expect(isPricingSectionViewed({ ...base, intersectionRatio: 0.5, intersectionRect: { height: 10 } })).toBe(true)
    expect(isPricingSectionViewed({ ...base, intersectionRatio: 0.1, intersectionRect: { height: 400 } })).toBe(true)
    expect(isPricingSectionViewed({ ...base, intersectionRatio: 0.1, intersectionRect: { height: 399 } })).toBe(false)
    expect(
      isPricingSectionViewed({ isIntersecting: false, intersectionRatio: 0, intersectionRect: { height: 0 }, rootBounds: null }),
    ).toBe(false)
  })
})

describe('pricing_view', () => {
  it('sends nothing while analytics is not allowed', () => {
    vi.mocked(readConsent).mockReturnValue(denied)
    renderPricing()
    reportVisibility(0.9)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('sends nothing before the section is half visible', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()
    reportVisibility(0.2, 100)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('sends exactly once, without properties, per page view', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()
    reportVisibility(0.6)
    reportVisibility(0.9)
    reportVisibility(0.7)
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('pricing_view', undefined)
  })

  it('still sends once if consent arrives after the first sighting', () => {
    vi.mocked(readConsent).mockReturnValue(denied)
    renderPricing()
    reportVisibility(0.8)
    expect(trackMock).not.toHaveBeenCalled()
    vi.mocked(readConsent).mockReturnValue(granted)
    reportVisibility(0.8)
    reportVisibility(0.8)
    expect(trackMock).toHaveBeenCalledTimes(1)
  })
})

describe('plan_cta_click', () => {
  it('sends the fixed plan label and billing period for each plan card', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()

    for (const code of ['free', 'starter', 'pro', 'ecommerce']) {
      trackMock.mockClear()
      const card = document.getElementById(`plan-${code}`)
      const cta = card?.querySelector('a')
      expect(cta).toBeTruthy()
      fireEvent.click(cta as HTMLElement)
      expect(trackMock).toHaveBeenCalledTimes(1)
      expect(trackMock).toHaveBeenCalledWith('plan_cta_click', { plan: code, billing: 'monthly' })
    }
  })

  it('reports the yearly period after switching the toggle', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()
    fireEvent.click(screen.getByRole('tab', { name: 'Yıllık' }))
    fireEvent.click(document.getElementById('plan-pro')?.querySelector('a') as HTMLElement)
    expect(trackMock).toHaveBeenCalledWith('plan_cta_click', { plan: 'pro', billing: 'yearly' })
  })

  it('sends nothing while analytics is not allowed', () => {
    vi.mocked(readConsent).mockReturnValue(denied)
    renderPricing()
    fireEvent.click(document.getElementById('plan-starter')?.querySelector('a') as HTMLElement)
    expect(trackMock).not.toHaveBeenCalled()
  })
})
