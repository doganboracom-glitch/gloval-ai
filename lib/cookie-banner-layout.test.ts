import { describe, expect, it } from 'vitest'
import {
  COOKIE_BANNER_ATTR,
  COOKIE_BANNER_HEIGHT_VAR,
  applyBannerInset,
  isCriticalActionPath,
  shouldUseCompactBanner,
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

describe('compact banner selection', () => {
  it('is compact on auth, billing and publish routes', () => {
    for (const p of ['/auth/sign-up', '/auth/login', '/billing', '/billing/add-ons', '/editor/abc', '/payment-result']) {
      expect(isCriticalActionPath(p)).toBe(true)
    }
  })

  it('is not matched by look-alike prefixes', () => {
    expect(isCriticalActionPath('/billingx')).toBe(false)
    expect(isCriticalActionPath('/')).toBe(false)
    expect(isCriticalActionPath(null)).toBe(false)
  })

  it('is compact on short viewports anywhere', () => {
    expect(shouldUseCompactBanner('/', 636)).toBe(true)
    expect(shouldUseCompactBanner('/', 900)).toBe(false)
    expect(shouldUseCompactBanner('/auth/login', 1200)).toBe(true)
  })
})
