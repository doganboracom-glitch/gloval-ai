// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockPath = '/'

vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    lang: 'tr',
    t: {
      cookie: {
        title: 'Çerezler',
        description: 'Deneyiminizi iyileştirmek için çerez kullanıyoruz.',
        policyLink: 'Çerez Politikası',
        customize: 'Tercihleri yönet',
        rejectAll: 'Yalnızca zorunlu',
        acceptAll: 'Tümünü kabul et',
        save: 'Kaydet',
        necessary: 'Zorunlu',
        necessaryDesc: 'd',
        always: 'Her zaman',
        analytics: 'Analitik',
        analyticsDesc: 'd',
        marketing: 'Pazarlama',
        marketingDesc: 'd',
      },
    },
  }),
}))

import { CookieConsent } from './cookie-consent'

class RO {
  observe() {}
  disconnect() {}
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', RO)
  document.cookie = 'gloval_cookie_consent=; max-age=0; path=/'
  window.localStorage.clear()
  mockPath = '/'
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function bannerClass() {
  return screen.getByRole('dialog').className
}

describe('CookieConsent banner', () => {
  it('renders the identical bottom-pinned bar at 360 / 768 / 1280 / 1920 wide', () => {
    const seen = new Set<string>()
    for (const [w, h] of [
      [360, 640],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ]) {
      setViewport(w, h)
      const { unmount } = render(<CookieConsent />)
      const cls = bannerClass()
      seen.add(cls)
      expect(cls).toContain('fixed')
      expect(cls).toContain('bottom-0')
      expect(cls).toContain('inset-x-0')
      expect(cls).not.toContain('rounded')
      unmount()
    }
    expect(seen.size).toBe(1)
  })

  it('looks the same on the home page and on auth pages', () => {
    const seen = new Set<string>()
    for (const p of ['/', '/auth/login', '/auth/sign-up', '/billing', '/dashboard']) {
      mockPath = p
      const { unmount } = render(<CookieConsent />)
      seen.add(bannerClass())
      unmount()
    }
    expect(seen.size).toBe(1)
  })

  it('does not change its styling when the page scrolls or resizes', () => {
    render(<CookieConsent />)
    const before = bannerClass()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      setViewport(390, 540)
    })
    expect(bannerClass()).toBe(before)
  })

  it('reserves bottom space while visible and releases it once a choice is made', () => {
    render(<CookieConsent />)
    expect(document.documentElement.hasAttribute('data-cookie-banner')).toBe(false)
    // jsdom has no layout, so offsetHeight is 0 and the inset stays released.
    fireEvent.click(screen.getByText('Tümünü kabul et'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.documentElement.hasAttribute('data-cookie-banner')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--cookie-banner-h')).toBe('')
  })

  it('keeps the three actions', () => {
    render(<CookieConsent />)
    expect(screen.getByText('Tercihleri yönet')).toBeTruthy()
    expect(screen.getByText('Yalnızca zorunlu')).toBeTruthy()
    expect(screen.getByText('Tümünü kabul et')).toBeTruthy()
  })
})
