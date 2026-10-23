import { describe, expect, it } from 'vitest'
import { autoplayEmbedUrl, lightboxCounter, stepIndex, swipeDirection } from '@/lib/lightbox-nav'

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(1, 3, 1)).toBe(2)
    expect(stepIndex(0, 1, 1)).toBe(0)
    expect(stepIndex(0, 0, 1)).toBe(0)
  })
})

describe('lightboxCounter', () => {
  it('is 1-based and clamped', () => {
    expect(lightboxCounter(0, 3)).toBe('1/3')
    expect(lightboxCounter(2, 3)).toBe('3/3')
    expect(lightboxCounter(9, 3)).toBe('3/3')
  })
})

describe('swipeDirection', () => {
  it('moves on long horizontal swipes only', () => {
    expect(swipeDirection(-80, 5)).toBe(1)
    expect(swipeDirection(80, -5)).toBe(-1)
    expect(swipeDirection(20, 0)).toBeNull()
    expect(swipeDirection(60, 90)).toBeNull()
  })
})

describe('autoplayEmbedUrl', () => {
  it('appends autoplay with the right separator', () => {
    expect(autoplayEmbedUrl('https://www.youtube-nocookie.com/embed/abc')).toBe(
      'https://www.youtube-nocookie.com/embed/abc?autoplay=1',
    )
    expect(autoplayEmbedUrl('https://player.vimeo.com/video/1?h=x')).toBe('https://player.vimeo.com/video/1?h=x&autoplay=1')
  })
})
