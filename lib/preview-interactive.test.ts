import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  KEEP_INTERACTIVE_ATTR,
  isKeepInteractiveTarget,
  resolveArrowKey,
  resolveSwipeDirection,
} from '@/lib/preview-interactive'
import { SliderSection } from '@/components/website-renderer/sections/slider-section'
import { HeroSection } from '@/components/website-renderer/sections/hero-section'

function fakeTarget(insideControl: boolean) {
  return {
    closest: (selector: string) =>
      insideControl && selector === `[${KEEP_INTERACTIVE_ATTR}]` ? ({} as Element) : null,
  }
}

describe('isKeepInteractiveTarget', () => {
  it('lets carousel controls through the editor selection capture', () => {
    expect(isKeepInteractiveTarget(fakeTarget(true))).toBe(true)
  })

  it('keeps every other element (links, add to cart) captured', () => {
    expect(isKeepInteractiveTarget(fakeTarget(false))).toBe(false)
    expect(isKeepInteractiveTarget(null)).toBe(false)
    expect(isKeepInteractiveTarget({})).toBe(false)
  })
})

describe('keyboard and swipe resolution', () => {
  it('maps arrow keys to steps and flips them in RTL', () => {
    expect(resolveArrowKey('ArrowRight')).toBe(1)
    expect(resolveArrowKey('ArrowLeft')).toBe(-1)
    expect(resolveArrowKey('ArrowRight', true)).toBe(-1)
    expect(resolveArrowKey('ArrowLeft', true)).toBe(1)
    expect(resolveArrowKey('Enter')).toBe(0)
  })

  it('treats a long horizontal drag as a swipe and ignores taps and vertical scrolls', () => {
    expect(resolveSwipeDirection(-80, 5)).toBe(1)
    expect(resolveSwipeDirection(80, -5)).toBe(-1)
    expect(resolveSwipeDirection(10, 0)).toBe(0)
    expect(resolveSwipeDirection(50, 90)).toBe(0)
  })
})

describe('carousel markup', () => {
  const slides = [
    { title: 'Bir', caption: 'a' },
    { title: 'İki', caption: 'b' },
    { title: 'Üç', caption: 'c' },
  ]

  it('marks every slider arrow and dot as keep-interactive and makes the root focusable', () => {
    const html = renderToStaticMarkup(
      createElement(SliderSection, { data: { type: 'slider', slides } as never }),
    )
    // 2 arrows + 3 dots
    expect(html.match(new RegExp(KEEP_INTERACTIVE_ATTR, 'g'))).toHaveLength(5)
    expect(html).toContain('tabindex="0"')
  })

  it('marks every hero slider arrow and dot as keep-interactive', () => {
    const html = renderToStaticMarkup(
      createElement(HeroSection, {
        data: { type: 'hero', variant: 'slider', title: 'Hero', slides } as never,
      }),
    )
    expect(html.match(new RegExp(KEEP_INTERACTIVE_ATTR, 'g'))).toHaveLength(5)
    expect(html).toContain('tabindex="0"')
  })

  it('renders no controls (and no focus stop) for a single slide', () => {
    const html = renderToStaticMarkup(
      createElement(SliderSection, { data: { type: 'slider', slides: slides.slice(0, 1) } as never }),
    )
    expect(html).not.toContain(KEEP_INTERACTIVE_ATTR)
    expect(html).not.toContain('tabindex')
  })
})
