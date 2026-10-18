import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COOKIE_THEME_VARS,
  PLATFORM_COOKIE_FALLBACKS,
  contrastRatio,
  cookieBannerCss,
  readableTextOn,
  resolveCookieBannerTheme,
} from '@/lib/cookie-banner-theme'
import type { WebsiteSchema } from '@/lib/website-schema'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

function site(theme: Record<string, string>): WebsiteSchema {
  return { theme } as unknown as WebsiteSchema
}

const SITES = [
  site({ primary: '#7c3aed', background: '#ffffff', foreground: '#111111' }),
  site({ primary: '#facc15', background: '#0b0b0f', foreground: '#f5f5f5' }),
  site({ primary: '#0f766e', background: '#f0fdfa', foreground: '#134e4a' }),
  site({ primary: '#fde047', background: '#fefce8', foreground: '#fef9c3' }),
  site({ primary: '#1e3a8a', background: '#e0e7ff', foreground: '#c7d2fe' }),
]

describe('cookie banner theme: contrast', () => {
  it.each(SITES.map((s, i) => [i, s] as const))('site %i keeps every text pair at >= 4.5:1', (_i, s) => {
    const t = resolveCookieBannerTheme(s)
    expect(contrastRatio(t.fg, t.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t.muted, t.bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t.brandFg, t.brand)).toBeGreaterThanOrEqual(4.5)
  })

  it('readableTextOn always reaches 4.5:1 on any brand color', () => {
    for (const hex of ['#000000', '#ffffff', '#7c3aed', '#facc15', '#808080', '#ff0000', '#00ff00']) {
      expect(contrastRatio(readableTextOn(hex), hex)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('cookie banner theme: tokens', () => {
  it('emits every cookie token as a validated hex on :root', () => {
    const css = cookieBannerCss(SITES[0])
    expect(css.startsWith(':root{')).toBe(true)
    for (const name of COOKIE_THEME_VARS) expect(css).toMatch(new RegExp(`${name}:#[0-9a-f]{6}`))
  })

  it('never injects non-hex values', () => {
    const css = cookieBannerCss(site({ primary: 'red;}body{display:none', background: 'url(x)', foreground: 'x' }))
    expect(css).not.toContain('display:none')
    expect(css).not.toContain('url(')
  })

  it('the button reads the theme token in globals.css, with the gloval token as fallback', () => {
    const css = read('app/globals.css')
    expect(css).toMatch(/var\(--cookie-brand,\s*var\(--color-brand\)\)/)
    expect(css).toMatch(/var\(--cookie-brand-fg,\s*var\(--color-brand-foreground\)\)/)
  })

  it('the banner component uses theme-token classes, not hard-coded colors', () => {
    const tsx = read('components/cookie-consent.tsx')
    expect(tsx).toMatch(/cookie-/)
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{6}\b/)
  })
})

describe('cookie banner theme: gloval.ai is unchanged', () => {
  it('no site means no tenant variables, so every rule resolves to the platform fallback', () => {
    expect(cookieBannerCss(null)).toBe('')
    expect(cookieBannerCss(undefined)).toBe('')
  })

  it('fallbacks are the purple brand and card tokens', () => {
    expect(PLATFORM_COOKIE_FALLBACKS.brand).toBe('var(--color-brand)')
    expect(PLATFORM_COOKIE_FALLBACKS.brandFg).toBe('var(--color-brand-foreground)')
    expect(PLATFORM_COOKIE_FALLBACKS.bg).toBe('var(--color-card)')
  })

  it('the root layout never sets cookie variables; only the tenant layout does', () => {
    expect(read('app/layout.tsx')).not.toContain('cookieBannerCss')
    expect(read('app/site/[slug]/layout.tsx')).toContain('cookieBannerCss')
  })
})
