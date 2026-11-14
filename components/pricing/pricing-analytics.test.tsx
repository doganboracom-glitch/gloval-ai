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

type ObserverRecord = {
  callback: ObserverCallback
  disconnected: boolean
  target: Element | null
  threshold: number | number[]
}

const observers: ObserverRecord[] = []

class FakeIntersectionObserver {
  private readonly record: ObserverRecord
  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.record = {
      callback,
      disconnected: false,
      target: null,
      threshold: options?.threshold ?? 0,
    }
    observers.push(this.record)
  }
  observe(target: Element) {
    this.record.target = target
  }
  unobserve() {}
  takeRecords() {
    return []
  }
  disconnect() {
    this.record.disconnected = true
  }
}

function reportIntersection(isIntersecting: boolean) {
  for (const observer of observers) {
    if (observer.disconnected) continue
    observer.callback([
      {
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: { height: isIntersecting ? 1 : 0 },
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
  it('uses intersection state without requiring a minimum visible share', () => {
    expect(isPricingSectionViewed({ isIntersecting: true })).toBe(true)
    expect(isPricingSectionViewed({ isIntersecting: false })).toBe(false)
  })
})

describe('pricing_view', () => {
  it('observes the pricing heading with a zero threshold', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()

    expect(observers).toHaveLength(1)
    expect(observers[0].target).toBe(screen.getByRole('heading', { name: 'İşletmen için doğru GLOVAL’ı seç.' }))
    expect(observers[0].threshold).toBe(0)
  })

  it('tracks when opened directly at #pricing', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    window.history.replaceState({}, '', '/#pricing')
    renderPricing()
    reportIntersection(true)

    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('pricing_view', undefined)
  })

  it('tracks when scrolling into pricing, without waiting for the whole section', () => {
    vi.mocked(readConsent).mockReturnValue(granted)
    renderPricing()
    reportIntersection(false)
    expect(trackMock).not.toHaveBeenCalled()

    reportIntersection(true)
    reportIntersection(true)
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('pricing_view', undefined)
  })

  it('sends nothing while analytics is not allowed', () => {
    vi.mocked(readConsent).mockReturnValue(denied)
    renderPricing()
    reportIntersection(true)
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('still sends once if consent arrives after the first sighting', () => {
    vi.mocked(readConsent).mockReturnValue(denied)
    renderPricing()
    reportIntersection(true)
    expect(trackMock).not.toHaveBeenCalled()
    vi.mocked(readConsent).mockReturnValue(granted)
    reportIntersection(true)
    reportIntersection(true)
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
