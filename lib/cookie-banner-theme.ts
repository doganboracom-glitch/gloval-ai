import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveTheme } from '@/components/website-renderer/theme'

/**
 * Cookie banner colors for published customer sites.
 *
 * The banner lives in the root layout, outside the site renderer, so it cannot
 * inherit the `--site-*` variables. The tenant layout instead emits the
 * `--cookie-*` variables below on `:root`; `.cookie-*` rules in globals.css read
 * them and fall back to the GLOVAL tokens, so gloval.ai (where nothing sets
 * them) keeps its purple banner unchanged.
 */

export const COOKIE_THEME_VARS = [
  '--cookie-brand',
  '--cookie-brand-fg',
  '--cookie-bg',
  '--cookie-fg',
  '--cookie-muted',
  '--cookie-border',
  '--cookie-hover',
] as const

/** The GLOVAL fallbacks every `.cookie-*` rule resolves to when no tenant theme is set. */
export const PLATFORM_COOKIE_FALLBACKS = {
  brand: 'var(--color-brand)',
  brandFg: 'var(--color-brand-foreground)',
  bg: 'var(--color-card)',
  fg: 'inherit',
  muted: 'var(--color-muted-foreground)',
  border: 'var(--color-border)',
  hover: 'color-mix(in oklab, var(--color-secondary) 60%, transparent)',
} as const

const HEX = /^#[0-9a-f]{6}$/i

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const INK = '#0b0b0f'
const PAPER = '#ffffff'

/** Whichever of near-black / white reads better on `hex` (always >= 4.5:1). */
export function readableTextOn(hex: string): string {
  return contrastRatio(hex, INK) >= contrastRatio(hex, PAPER) ? INK : PAPER
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

function asHex(value: string): string | null {
  const v = value.trim()
  return HEX.test(v) ? v.toLowerCase() : null
}

export type CookieBannerTheme = {
  brand: string
  brandFg: string
  bg: string
  fg: string
  muted: string
  border: string
  hover: string
}

/** Resolves the banner colors from a site's own theme. Every text/background pair is >= 4.5:1. */
export function resolveCookieBannerTheme(site: WebsiteSchema): CookieBannerTheme {
  const theme = resolveTheme(site)
  const brand = asHex(theme.primary) ?? '#7c3aed'
  const background = asHex(theme.background) ?? PAPER
  // The surface is the site background nudged toward its text so it stays distinct from the page.
  const foregroundRaw = asHex(theme.foreground) ?? readableTextOn(background)
  const bg = mixHex(background, foregroundRaw, 0.04)
  const fg = contrastRatio(foregroundRaw, bg) >= 4.5 ? foregroundRaw : readableTextOn(bg)
  const muted = mixHex(fg, bg, 0.28)
  return {
    brand,
    brandFg: readableTextOn(brand),
    bg,
    fg,
    muted: contrastRatio(muted, bg) >= 4.5 ? muted : fg,
    border: mixHex(bg, fg, 0.22),
    hover: mixHex(bg, fg, 0.1),
  }
}

/** CSS for the tenant layout's `<style>`; every value is a validated hex, so it is injection-safe. */
export function cookieBannerCss(site: WebsiteSchema | null | undefined): string {
  if (!site) return ''
  const t = resolveCookieBannerTheme(site)
  const decls = [
    ['--cookie-brand', t.brand],
    ['--cookie-brand-fg', t.brandFg],
    ['--cookie-bg', t.bg],
    ['--cookie-fg', t.fg],
    ['--cookie-muted', t.muted],
    ['--cookie-border', t.border],
    ['--cookie-hover', t.hover],
  ]
    .filter(([, value]) => HEX.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
  return `:root{${decls}}`
}
