// @vitest-environment jsdom

import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const languageState = vi.hoisted(() => ({ lang: 'tr' }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: languageState.lang }) }))

import { ReferralDashboardPanel } from './referral-dashboard-panel'

const observers: TestIntersectionObserver[] = []

class TestIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.push(this)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

const dashboardData = {
  referralCode: 'PARTNER1234',
  clicks: 1,
  signups: 1,
  verifiedSignups: 1,
  paidCustomers: 0,
  customers: [],
}

let originalMatchMedia: PropertyDescriptor | undefined
let originalScrollIntoView: PropertyDescriptor | undefined

afterEach(() => {
  cleanup()
  observers.length = 0
  vi.unstubAllGlobals()
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
  else Reflect.deleteProperty(window, 'matchMedia')
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  originalMatchMedia = undefined
  originalScrollIntoView = undefined
})

describe('referral dashboard jump button', () => {
  it('scrolls smoothly unless reduced motion is requested and hides while the section is visible', () => {
    languageState.lang = 'tr'
    const scrollIntoView = vi.fn()
    let reducedMotion = false
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: reducedMotion }),
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)

    render(<ReferralDashboardPanel data={dashboardData} />)
    const jumpButton = screen.getByRole('link', { name: /Satış Ortaklığı/u })
    expect(jumpButton.getAttribute('href')).toBe('#satis-ortakligi')
    expect(jumpButton.className).toContain('fixed')
    expect(jumpButton.className).toContain('left-4')

    fireEvent.click(jumpButton)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })

    reducedMotion = true
    fireEvent.click(jumpButton)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' })

    act(() => observers[0].trigger(true))
    expect(screen.queryByRole('link', { name: /Satış Ortaklığı/u })).toBeNull()
    act(() => observers[0].trigger(false))
    expect(screen.getByRole('link', { name: /Satış Ortaklığı/u })).toBeTruthy()
  })
})
