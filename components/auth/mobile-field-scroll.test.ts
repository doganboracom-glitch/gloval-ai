// @vitest-environment jsdom
import type { FocusEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keepAuthFieldVisibleOnMobile } from './mobile-field-scroll'

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

function configureViewport({
  mobile,
  reducedMotion = false,
  height = 500,
}: {
  mobile: boolean
  reducedMotion?: boolean
  height?: number
}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: ((query: string) => ({
      matches: query === '(max-width: 767px)' ? mobile : reducedMotion,
    })) as typeof window.matchMedia,
  })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, height },
  })
}

function focusField({ top, bottom }: { top: number; bottom: number }) {
  const field = document.createElement('input')
  const scrollIntoView = vi.fn()
  Object.defineProperty(field, 'scrollIntoView', { value: scrollIntoView })
  field.getBoundingClientRect = () =>
    ({
      x: 0,
      y: top,
      top,
      right: 100,
      bottom,
      left: 0,
      width: 100,
      height: bottom - top,
      toJSON: () => ({}),
    }) as DOMRect
  document.body.append(field)
  field.focus()
  keepAuthFieldVisibleOnMobile({ currentTarget: field } as unknown as FocusEvent<HTMLInputElement>)
  return scrollIntoView
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia)
  else Reflect.deleteProperty(window, 'matchMedia')
  if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport)
  else Reflect.deleteProperty(window, 'visualViewport')
})

describe('keepAuthFieldVisibleOnMobile', () => {
  it('waits for the keyboard and scrolls only an obstructed field once', () => {
    configureViewport({ mobile: true })
    vi.useFakeTimers()

    const scrollIntoView = focusField({ top: 470, bottom: 514 })
    vi.advanceTimersByTime(349)
    expect(scrollIntoView).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  })

  it('does not move a field that is already comfortably visible', () => {
    configureViewport({ mobile: true })
    vi.useFakeTimers()

    const scrollIntoView = focusField({ top: 200, bottom: 244 })
    vi.advanceTimersByTime(350)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not change desktop focus behavior', () => {
    configureViewport({ mobile: false })
    vi.useFakeTimers()

    const scrollIntoView = focusField({ top: 470, bottom: 514 })
    vi.advanceTimersByTime(350)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls without animation when reduced motion is preferred', () => {
    configureViewport({ mobile: true, reducedMotion: true })
    vi.useFakeTimers()

    const scrollIntoView = focusField({ top: 470, bottom: 514 })
    vi.advanceTimersByTime(350)

    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      behavior: 'instant',
      block: 'center',
      inline: 'nearest',
    })
  })
})
