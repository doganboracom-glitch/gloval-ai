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
        title: 'Çerez tercihleriniz',
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
import { COOKIE_BANNER_ATTR, COOKIE_BANNER_HEIGHT_VAR } from '@/lib/cookie-banner-layout'

let observed: (() => void) | null = null

class RO {
  constructor(cb: () => void) {
    observed = cb
  }
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
  observed = null
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute(COOKIE_BANNER_ATTR)
  document.documentElement.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR)
})

function cardClass() {
  return screen.getByRole('dialog').className
}

describe('CookieConsent floating card', () => {
  it('renders the identical floating card at 360 / 768 / 1280 / 1920 wide', () => {
    const seen = new Set<string>()
    for (const [w, h] of [
      [360, 640],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ]) {
      setViewport(w, h)
      const { unmount } = render(<CookieConsent />)
      const cls = cardClass()
      seen.add(cls)
      for (const c of ['fixed', 'rounded-2xl', 'inset-x-3', 'sm:left-5', 'sm:bottom-5', 'sm:max-w-[400px]']) {
        expect(cls.split(' ')).toContain(c)
      }
      expect(cls.split(' ')).not.toContain('bottom-0')
      unmount()
    }
    expect(seen.size).toBe(1)
  })

  it('looks the same on the home page, auth, billing and editor routes', () => {
    const seen = new Set<string>()
    for (const p of ['/', '/auth/login', '/auth/sign-up', '/billing', '/editor/abc', '/dashboard']) {
      mockPath = p
      const { unmount } = render(<CookieConsent />)
      seen.add(cardClass())
      unmount()
    }
    expect(seen.size).toBe(1)
  })

  it('does not re-mount or restyle on route change, scroll or resize', () => {
    const { rerender } = render(<CookieConsent />)
    const node = screen.getByRole('dialog')
    const before = node.className
    act(() => {
      mockPath = '/billing'
    })
    rerender(<CookieConsent />)
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      setViewport(390, 540)
    })
    expect(screen.getByRole('dialog')).toBe(node)
    expect(node.className).toBe(before)
  })

  it('sits below modal overlays (z-45 < z-50) and is a non-modal, labelled dialog', () => {
    render(<CookieConsent />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className.split(' ')).toContain('z-[45]')
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    const desc = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')
    expect(title?.textContent).toBe('Çerez tercihleriniz')
    expect(desc?.textContent).toContain('çerez kullanıyoruz')
  })

  it('has no focus trap: every action is a plain focusable button', () => {
    render(<CookieConsent />)
    for (const label of ['Tümünü kabul et', 'Yalnızca zorunlu', 'Tercihleri yönet']) {
      const btn = screen.getByText(label)
      expect(btn.tagName).toBe('BUTTON')
      expect(btn.getAttribute('tabindex')).toBeNull()
      expect(btn.className).toContain('cookie-focus')
    }
  })

  it('reserves bottom space while visible and releases it once a choice is made', () => {
    const root = document.documentElement
    const node = render(<CookieConsent />) && screen.getByRole('dialog')
    Object.defineProperty(node, 'offsetHeight', { configurable: true, value: 180 })
    act(() => observed?.())
    expect(root.hasAttribute(COOKIE_BANNER_ATTR)).toBe(true)
    expect(root.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe('180px')

    fireEvent.click(screen.getByText('Tümünü kabul et'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(root.hasAttribute(COOKIE_BANNER_ATTR)).toBe(false)
    expect(root.style.getPropertyValue(COOKIE_BANNER_HEIGHT_VAR)).toBe('')
  })

  it('releases the reserved space when "Yalnızca zorunlu" is chosen', () => {
    const root = document.documentElement
    const node = render(<CookieConsent />) && screen.getByRole('dialog')
    Object.defineProperty(node, 'offsetHeight', { configurable: true, value: 180 })
    act(() => observed?.())
    fireEvent.click(screen.getByText('Yalnızca zorunlu'))
    expect(root.hasAttribute(COOKIE_BANNER_ATTR)).toBe(false)
  })

  it('expands the preferences inside the same card (no second dialog)', () => {
    render(<CookieConsent />)
    const node = screen.getByRole('dialog')
    fireEvent.click(screen.getByText('Tercihleri yönet'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBe(node)
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByText('Kaydet')).toBeTruthy()
  })

  it('keeps the three actions with the primary one first', () => {
    render(<CookieConsent />)
    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Tümünü kabul et', 'Yalnızca zorunlu', 'Tercihleri yönet'])
  })
})
