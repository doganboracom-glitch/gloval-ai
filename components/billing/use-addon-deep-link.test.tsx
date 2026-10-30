// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAddonDeepLink } from '@/components/billing/use-addon-deep-link'
import { ADDON_HIGHLIGHT_MS, ADDON_SECTION_OPEN_MS } from '@/lib/billing-addon-focus'

const scrollIntoView = vi.fn()

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

function addCard(code: string) {
  const card = document.createElement('div')
  card.id = `addon-${code}`
  card.scrollIntoView = scrollIntoView
  document.body.appendChild(card)
  return card
}

beforeEach(() => {
  vi.useFakeTimers()
  setReducedMotion(false)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  scrollIntoView.mockClear()
  vi.useRealTimers()
})

describe('useAddonDeepLink', () => {
  it('scrolls to the card after the section opens, highlights it, then clears after ~2s', () => {
    window.history.replaceState(null, '', '/billing?addon=aura_cursor')
    addCard('aura_cursor')
    const { result } = renderHook(() => useAddonDeepLink())

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(result.current).toBeNull()

    act(() => {
      vi.advanceTimersByTime(ADDON_SECTION_OPEN_MS)
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(result.current).toBe('aura_cursor')

    act(() => {
      vi.advanceTimersByTime(ADDON_HIGHLIGHT_MS - 1)
    })
    expect(result.current).toBe('aura_cursor')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBeNull()
  })

  it('respects reduced motion: instant scroll with no wait', () => {
    setReducedMotion(true)
    window.history.replaceState(null, '', '/billing?addon=aura_cursor')
    addCard('aura_cursor')
    renderHook(() => useAddonDeepLink())

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
  })

  it('keeps the existing behaviour when no card matches the addon code', () => {
    window.history.replaceState(null, '', '/billing?addon=aura_cursor')
    const { result } = renderHook(() => useAddonDeepLink())

    act(() => {
      vi.advanceTimersByTime(ADDON_SECTION_OPEN_MS + ADDON_HIGHLIGHT_MS)
    })
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('does nothing without an addon param', () => {
    window.history.replaceState(null, '', '/billing')
    addCard('aura_cursor')
    const { result } = renderHook(() => useAddonDeepLink())

    act(() => {
      vi.advanceTimersByTime(ADDON_SECTION_OPEN_MS + ADDON_HIGHLIGHT_MS)
    })
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })
})
