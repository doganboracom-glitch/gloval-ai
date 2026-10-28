import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COOKIE_BANNER_ATTR,
  COOKIE_BANNER_CLASS,
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

describe('single banner design', () => {
  const classes = COOKIE_BANNER_CLASS.split(' ')

  it('is pinned to the bottom edge at full width', () => {
    for (const c of ['fixed', 'inset-x-0', 'bottom-0']) expect(classes).toContain(c)
  })

  it('is never the floating-card variant', () => {
    expect(COOKIE_BANNER_CLASS).not.toMatch(/rounded|max-w-|mx-auto|sticky|translate|absolute/)
  })

  it('caps its height at 40% of the screen and respects the iOS safe area', () => {
    expect(classes).toContain('max-h-[40dvh]')
    expect(COOKIE_BANNER_CLASS).toContain('env(safe-area-inset-bottom)')
  })

  it('stays below modal / checkout overlays (z-50 and above)', () => {
    expect(COOKIE_BANNER_Z_CLASS).toBe('z-[45]')
    expect(classes).toContain(COOKIE_BANNER_Z_CLASS)
  })
})

describe('stylesheet rules', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

  it('reserves bottom space only while the banner attribute is set', () => {
    expect(css).toMatch(/html\[data-cookie-banner\] body\s*\{\s*padding-bottom:\s*var\(--cookie-banner-h\)/)
  })

  it('does not shrink modal overlays to make room for the banner', () => {
    expect(css).not.toMatch(/html\[data-cookie-banner\] \.fixed\.inset-0/)
  })
})
