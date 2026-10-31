// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdsProductSwitch } from './ads-product-switch'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    t: {
      ads: {
        switchLabel: 'Ürün seçimi',
        switchBuild: 'Website Oluştur',
        switchAds: 'Reklam Ver',
      },
    },
  }),
}))

const originalMatchMedia = window.matchMedia

function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  push.mockReset()
  window.matchMedia = originalMatchMedia
  document.documentElement.classList.remove('ads-route-transition')
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('AdsProductSwitch', () => {
  it('does not render while the feature flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '0')

    render(<AdsProductSwitch active="build" />)

    expect(screen.queryByRole('navigation', { name: 'Ürün seçimi' })).toBeNull()
  })

  it('marks Website Oluştur as active on the homepage', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')

    render(<AdsProductSwitch active="build" />)

    expect(screen.getByRole('link', { name: 'Website Oluştur' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Reklam Ver' }).getAttribute('aria-current')).toBeNull()
  })

  it('navigates to /ads with the View Transitions API when supported', () => {
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    setReducedMotion(false)
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return { finished: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    })

    render(<AdsProductSwitch active="build" />)
    const link = screen.getByRole('link', { name: 'Reklam Ver' })
    expect(link.getAttribute('href')).toBe('/ads')
    fireEvent.click(link)

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/ads')
    expect(document.documentElement.classList.contains('ads-route-transition')).toBe(true)
  })

  it('uses the CSS fallback when View Transitions are unavailable', () => {
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: undefined,
    })
    setReducedMotion(false)

    render(<AdsProductSwitch active="build" />)
    fireEvent.click(screen.getByRole('link', { name: 'Reklam Ver' }))

    expect(push).toHaveBeenCalledWith('/ads')
    expect(document.documentElement.classList.contains('ads-route-transition')).toBe(true)
    vi.advanceTimersByTime(680)
    expect(document.documentElement.classList.contains('ads-route-transition')).toBe(false)
  })

  it('leaves navigation untouched when reduced motion is preferred', () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    setReducedMotion(true)

    render(<AdsProductSwitch active="build" />)
    const link = screen.getByRole('link', { name: 'Reklam Ver' })
    let preventedByComponent = true
    document.addEventListener(
      'click',
      (event) => {
        preventedByComponent = event.defaultPrevented
        event.preventDefault()
      },
      { once: true },
    )
    fireEvent.click(link)

    expect(preventedByComponent).toBe(false)
    expect(document.documentElement.classList.contains('ads-route-transition')).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
