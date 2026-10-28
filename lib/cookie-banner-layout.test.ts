import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COOKIE_BANNER_ATTR,
  COOKIE_BANNER_BODY_CLASS,
  COOKIE_BANNER_CLASS,
  COOKIE_BANNER_FOOTER_CLASS,
  COOKIE_BANNER_MOBILE_MAX_WIDTH,
  COOKIE_BANNER_HEIGHT_VAR,
  COOKIE_BANNER_Z_CLASS,
  applyBannerInset,
  type BannerInsetRoot,
} from './cookie-banner-layout'

function fakeRoot() {
  const vars = new Map<string, string>()
  const attrs = new Set<string>()
  const root: BannerInsetRoot = {
    style: {
      setProperty: (n, v) => void vars.set(n, v),
      removeProperty: (n) => void vars.delete(n),
    },
    setAttribute: (n) => void attrs.add(n),
    removeAttribute: (n) => void attrs.delete(n),
  }
  return { root, vars, attrs }
}

describe('applyBannerInset', () => {
  it('reserves the measured height and flags the root', () => {
    const { root, vars, attrs } = fakeRoot()
    applyBannerInset(root, 79.4)
    expect(vars.get(COOKIE_BANNER_HEIGHT_VAR)).toBe('80px')
    expect(attrs.has(COOKIE_BANNER_ATTR)).toBe(true)
  })

  it('releases the space together with the flag when the banner closes', () => {
    const { root, vars, attrs } = fakeRoot()
    applyBannerInset(root, 80)
    applyBannerInset(root, null)
    expect(vars.size).toBe(0)
    expect(attrs.size).toBe(0)
  })

  it('treats a zero height as closed', () => {
    const { root, vars, attrs } = fakeRoot()
    applyBannerInset(root, 80)
    applyBannerInset(root, 0)
    expect(vars.size + attrs.size).toBe(0)
  })
})

describe('single floating card design', () => {
  const classes = COOKIE_BANNER_CLASS.split(' ')

  it('is a rounded, glass, shadowed card', () => {
    for (const c of ['rounded-2xl', 'border', 'backdrop-blur-xl', 'shadow-2xl', 'fixed']) {
      expect(classes).toContain(c)
    }
  })

  it('mobile (<640px): 12px gutters, full width, not stuck to the bottom edge', () => {
    expect(classes).toContain('inset-x-3')
    expect(classes).not.toContain('bottom-0')
    expect(classes).not.toContain('inset-x-0')
    expect(COOKIE_BANNER_CLASS).toContain('bottom-[max(0.75rem,env(safe-area-inset-bottom))]')
    expect(classes).toContain('max-h-[45dvh]')
  })

  it('desktop (>=640px): bottom-left corner, 20px from the edges, 400px wide, 70vh tall at most', () => {
    for (const c of ['sm:inset-x-auto', 'sm:left-5', 'sm:bottom-5', 'sm:max-w-[400px]', 'sm:max-h-[70vh]']) {
      expect(classes).toContain(c)
    }
    expect(COOKIE_BANNER_CLASS).not.toMatch(/sm:right-|sm:bottom-0|sm:inset-x-0/)
  })

  it('has no route / scroll dependent variants', () => {
    expect(classes.filter((c) => /^(sticky|absolute|hidden|translate|md:|lg:|xl:)/.test(c))).toEqual([])
  })

  it('stays below modal / checkout overlays (z-50 and above)', () => {
    expect(COOKIE_BANNER_Z_CLASS).toBe('z-[45]')
    expect(classes).toContain(COOKIE_BANNER_Z_CLASS)
  })

  it('keeps the card body scrollable and the buttons visible', () => {
    expect(COOKIE_BANNER_BODY_CLASS).toContain('overflow-y-auto')
    expect(COOKIE_BANNER_FOOTER_CLASS).toContain('shrink-0')
  })
})

describe('stylesheet rules', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

  it('reserves bottom space only while the card attribute is set', () => {
    expect(css).toMatch(/html\[data-cookie-banner\] body\s*\{\s*padding-bottom:\s*var\(--cookie-banner-space\)/)
  })

  it('reserves bottom space on phones only', () => {
    const mediaStart = css.indexOf(`@media (max-width: ${COOKIE_BANNER_MOBILE_MAX_WIDTH}px) {`)
    const mediaEnd = css.indexOf('\n}\n', mediaStart)
    const phoneBlock = css.slice(mediaStart, mediaEnd)
    expect(mediaStart).toBeGreaterThan(-1)
    expect(phoneBlock).toContain('html[data-cookie-banner] body')
    const occurrences = css.split('html[data-cookie-banner] body').length - 1
    expect(occurrences).toBe(1)
  })

  it('does not shrink modal overlays to make room for the card', () => {
    expect(css).not.toMatch(/html\[data-cookie-banner\] \.fixed\.inset-0/)
  })

  it('animates only once and not with reduced motion', () => {
    expect(css).toMatch(/\.cookie-card-enter\s*\{\s*animation:\s*cookie-card-in 200ms ease-out backwards/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.cookie-card-enter\s*\{\s*animation:\s*none/)
  })
})
