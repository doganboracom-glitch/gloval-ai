import { describe, expect, it } from 'vitest'
import {
  MAX_HERO_OVERLAY,
  clampOverlay,
  hasHeroLayout,
  normalizeAlign,
  overlayGradient,
  resolveHeroLayout,
  textZoneAlpha,
  whiteTextContrastOverBrightPhoto,
} from '@/lib/hero-layout'

describe('hero layout settings', () => {
  it('treats an unset or unknown layout as legacy', () => {
    expect(hasHeroLayout({})).toBe(false)
    expect(hasHeroLayout({ layout: 'bogus' as never })).toBe(false)
    expect(hasHeroLayout({ layout: 'full-bleed' })).toBe(true)
  })

  it('clamps overlay into 0..70 and defaults bad input', () => {
    expect(clampOverlay(-10)).toBe(0)
    expect(clampOverlay(500)).toBe(MAX_HERO_OVERLAY)
    expect(clampOverlay(undefined)).toBe(40)
    expect(clampOverlay(Number.NaN)).toBe(40)
  })

  it('only allows centered copy on full-bleed', () => {
    expect(normalizeAlign('full-bleed', 'center')).toBe('center')
    expect(normalizeAlign('split', 'center')).toBe('left')
    expect(normalizeAlign('light-cover', 'center')).toBe('left')
    expect(normalizeAlign('split', 'right')).toBe('right')
  })

  it('resolves defaults for a bare layout', () => {
    expect(resolveHeroLayout({ layout: 'light-cover' })).toEqual({
      layout: 'light-cover',
      align: 'left',
      overlay: 40,
      imageFit: 'contain',
    })
  })
})

describe('full-bleed text contrast', () => {
  it('keeps white text at >= 4.5:1 over a pure-white photo for every overlay value', () => {
    for (let overlay = 0; overlay <= MAX_HERO_OVERLAY; overlay += 1) {
      const ratio = whiteTextContrastOverBrightPhoto(textZoneAlpha(overlay))
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('emits a scrim for every alignment', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      expect(overlayGradient(align, 40)).toMatch(/gradient\(/)
    }
  })
})
