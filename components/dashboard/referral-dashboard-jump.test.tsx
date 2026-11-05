// @vitest-environment jsdom

import { act, cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const languageState = vi.hoisted(() => ({ lang: 'tr' }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: languageState.lang }) }))

import { ReferralDashboardPanel } from './referral-dashboard-panel'

const observers: TestIntersectionObserver[] = []

class TestIntersectionObserver {
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    observers.push(this)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
  trigger(isIntersecting: boolean, top?: number) {
    const entry = { isIntersecting, boundingClientRect: top === undefined ? undefined : { top } }
    this.callback([entry as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
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
    const jumpButton = screen.getByRole('link', { name: 'Satış ortaklığı bölümüne git' })
    expect(jumpButton.getAttribute('href')).toBe('#satis-ortakligi')
    expect(jumpButton.className).toContain('fixed')
    expect(jumpButton.className).toContain('right-4')
    expect(jumpButton.className).not.toContain('left-4')
    expect(jumpButton.className).toContain('safe-area-inset-bottom')
    expect(jumpButton.className).toContain('z-30')

    fireEvent.click(jumpButton)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })

    reducedMotion = true
    fireEvent.click(jumpButton)
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' })

    act(() => observers[0].trigger(true))
    expect(screen.queryByRole('link', { name: 'Satış ortaklığı bölümüne git' })).toBeNull()
    act(() => observers[0].trigger(false))
    expect(screen.getByRole('link', { name: 'Satış ortaklığı bölümüne git' })).toBeTruthy()
  })

  it('hides before the heading can slide under it and does not return once the section is passed', () => {
    languageState.lang = 'tr'
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    render(<ReferralDashboardPanel data={dashboardData} />)
    const linkName = 'Satış ortaklığı bölümüne git'

    expect(observers[0].options?.rootMargin).toBe('0px 0px -96px 0px')
    expect(observers[0].options?.threshold).toBe(0)

    act(() => observers[0].trigger(false, 900))
    expect(screen.getByRole('link', { name: linkName })).toBeTruthy()
    act(() => observers[0].trigger(true, 600))
    expect(screen.queryByRole('link', { name: linkName })).toBeNull()
    act(() => observers[0].trigger(false, -1200))
    expect(screen.queryByRole('link', { name: linkName })).toBeNull()
  })

  it('is hidden while a dialog is open and while the on-screen keyboard is open', async () => {
    languageState.lang = 'tr'
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    const viewport = new EventTarget() as EventTarget & { height: number; scale: number }
    viewport.height = window.innerHeight
    viewport.scale = 1
    vi.stubGlobal('visualViewport', viewport)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    render(<ReferralDashboardPanel data={dashboardData} />)
    const linkName = 'Satış ortaklığı bölümüne git'
    expect(screen.getByRole('link', { name: linkName })).toBeTruthy()

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    await act(async () => { document.body.appendChild(dialog) })
    expect(screen.queryByRole('link', { name: linkName })).toBeNull()
    await act(async () => { dialog.remove() })
    expect(screen.getByRole('link', { name: linkName })).toBeTruthy()

    act(() => {
      viewport.height = window.innerHeight - 300
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(screen.queryByRole('link', { name: linkName })).toBeNull()
    act(() => {
      viewport.height = window.innerHeight
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(screen.getByRole('link', { name: linkName })).toBeTruthy()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  it('renders no referral links when the feature is disabled', () => {
    languageState.lang = 'tr'
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    render(<ReferralDashboardPanel data={null} enabled={false} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
