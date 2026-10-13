/**
 * Single source of truth for Logo Studio design rules: the four visual styles
 * (type pairing, letter spacing, emblem shape language), the emblem/wordmark
 * proportion and alignment rules, colourways, and the brand-kit usage rules
 * (minimum size, clear space). `compose.ts`, `emblem-local.ts`, `favicon.ts`,
 * the AI prompt and the brand kit all read from here so a rule changes once.
 */

/**
 * Credit rule of the AI emblem flow (single source for the API route, the
 * credit ledger and the dialog copy). Every AI round draws AI_EMBLEMS_PER_ROUND
 * emblems and charges LOGO_EMBLEM_CREDITS per emblem actually drawn, so a
 * "suggest again" costs the same again; the local library is always free.
 */
export const AI_EMBLEMS_PER_ROUND = 2
export const LOGO_EMBLEM_CREDITS = 2

export type LogoStyleId = 'modern' | 'classic' | 'minimal' | 'luxury'
export const LOGO_STYLE_IDS: LogoStyleId[] = ['modern', 'classic', 'minimal', 'luxury']

export type FrameId = 'plain' | 'disc' | 'squircle' | 'ring' | 'tile' | 'diamond'

export type StyleSpec = {
  id: LogoStyleId
  /** Google Fonts family used for the wordmark (bundled Poppins is the offline fallback). */
  fontFamily: string
  /** Weights to try, best first ('' = whatever the family serves by default). */
  weights: string[]
  /** Variable fonts only give Regular outlines; emulate bold with a stroke. */
  emulateBold: boolean
  /** Letter-spacing (em) of the typed brand name. */
  letterSpacing: number
  /** Letter-spacing (em) of the upper-case variant (stacked layout, luxury). */
  capsSpacing: number
  textCase: 'plain' | 'caps'
  /** Frames the emblem may sit in, in order of preference. */
  frames: FrameId[]
  /** Stroke width (of 100) of outlined frames. */
  ringWeight: number
  /** Solid badge used for the simplified favicon variant. */
  simpleFrame: 'disc' | 'squircle'
  /** Monogram badge: filled with a coloured shape, or just outlined. */
  monogramFilled: boolean
  /** Multiplies the emblem height relative to the text cap height. */
  emblemScale: number
  /** Multiplies the gap between emblem and text. */
  gapScale: number
  ai: { shape: string; mood: string }
}

export const STYLE_SPECS: Record<LogoStyleId, StyleSpec> = {
  modern: {
    id: 'modern',
    fontFamily: 'Poppins',
    weights: ['700', '600', ''],
    emulateBold: true,
    letterSpacing: 0.01,
    capsSpacing: 0.12,
    textCase: 'plain',
    frames: ['squircle', 'disc'],
    ringWeight: 7,
    simpleFrame: 'squircle',
    monogramFilled: true,
    emblemScale: 1,
    gapScale: 1,
    ai: {
      shape: 'rounded geometric forms, circles and soft-cornered squares, confident and contemporary',
      mood: 'modern, clean, friendly and confident',
    },
  },
  classic: {
    id: 'classic',
    fontFamily: 'Playfair Display',
    weights: ['700', '600', ''],
    emulateBold: true,
    letterSpacing: 0,
    capsSpacing: 0.14,
    textCase: 'plain',
    frames: ['ring', 'disc'],
    ringWeight: 6,
    simpleFrame: 'disc',
    monogramFilled: true,
    emblemScale: 0.95,
    gapScale: 1.1,
    ai: {
      shape: 'a symmetrical crest-like or badge-like emblem, balanced proportions, traditional heritage feel',
      mood: 'classic, timeless, trustworthy and established',
    },
  },
  minimal: {
    id: 'minimal',
    fontFamily: 'Inter',
    weights: ['400', ''],
    emulateBold: false,
    letterSpacing: 0.005,
    capsSpacing: 0.2,
    textCase: 'plain',
    frames: ['ring'],
    ringWeight: 3.5,
    simpleFrame: 'squircle',
    monogramFilled: false,
    emblemScale: 0.85,
    gapScale: 1.3,
    ai: {
      shape: 'one or two extremely simple shapes with generous negative space and no ornament',
      mood: 'minimal, quiet, precise and airy',
    },
  },
  luxury: {
    id: 'luxury',
    fontFamily: 'Cormorant Garamond',
    weights: ['600', '700', ''],
    emulateBold: false,
    letterSpacing: 0.04,
    capsSpacing: 0.28,
    textCase: 'caps',
    frames: ['diamond', 'ring', 'tile'],
    ringWeight: 2.5,
    simpleFrame: 'disc',
    monogramFilled: false,
    emblemScale: 0.9,
    gapScale: 1.5,
    ai: {
      shape: 'refined fine geometry, thin precise lines, diamond or arch motifs, elegant symmetry',
      mood: 'luxurious, elegant, premium and exclusive',
    },
  },
}

export function styleSpec(id: string | undefined | null): StyleSpec {
  return STYLE_SPECS[(id as LogoStyleId) in STYLE_SPECS ? (id as LogoStyleId) : 'modern']
}

/**
 * Emblem <-> wordmark proportion and alignment rules. Heights are expressed
 * relative to the wordmark's CAP height (never its full bbox) so lockups keep
 * their rhythm whichever font or style is used.
 */
export const PROPORTIONS = {
  horizontal: {
    /** Emblem height = cap height x this (x style.emblemScale). */
    emblemToCap: 2.3,
    /** Gap between emblem and text = cap height x this (x style.gapScale). */
    gapToCap: 0.6,
    /** Emblem width may not exceed height x this. */
    maxEmblemAspect: 1.5,
  },
  vertical: {
    textScale: 0.62,
    /** Emblem height = (scaled) text cap height x this. */
    emblemToTextCap: 4.6,
    gapToTextCap: 1.15,
    maxEmblemAspect: 1.3,
  },
  wordmark: { barWidthRatio: 0.2, barMinWidth: 24, barHeightToCap: 0.1, barGapToCap: 0.42 },
  /** Round shapes look smaller than squares of the same size; compensate. */
  roundOvershoot: 1.05,
  /** Even padding around the finished lockup (share of the short side). */
  padRatio: 0.04,
  padMin: 2,
} as const

/** Optical alignment: emblem centre line == text CAP-height centre line. */
export const ALIGNMENT = 'emblem-center = cap-center' as const

/** Brand-kit usage rules (also printed on the kit page). */
export const USAGE_RULES = {
  minSize: {
    horizontal: { px: 120, mm: 30 },
    vertical: { px: 64, mm: 16 },
    wordmark: { px: 90, mm: 24 },
    icon: { px: 16, mm: 5 },
  },
  /** Clear space around the logo = this share of the emblem height. */
  clearSpaceRatio: 0.5,
} as const

export function clearSpace(emblemHeight: number): number {
  return Math.round(emblemHeight * USAGE_RULES.clearSpaceRatio * 100) / 100
}

/* ---- colour ------------------------------------------------------------- */

export function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = hexLuminance(a)
  const lb = hexLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export type LogoSurface = 'site' | 'light' | 'dark'
export const LIGHT_SURFACE = '#ffffff'
export const DARK_SURFACE = '#0b0d12'
const LIGHT_INK = '#111827'
const DARK_INK = '#f8fafc'

export type SiteColors = {
  primary: string
  primaryFg: string
  accent: string
  foreground: string
  background: string
}

/** Colours a logo is drawn with. `fg` is the glyph colour on a filled `a` badge. */
export type LogoColors = {
  a: string
  b: string
  ink: string
  fg: string
  /** Set for the reversed colourway: the brand colour the logo must sit on. */
  canvas?: string
}

export type ColorwayId = 'brand' | 'swap' | 'ink' | 'mono' | 'reverse'
/** Three ready-made pairings from the site palette, plus single colour and reversed. */
export const COLORWAY_IDS: ColorwayId[] = ['brand', 'swap', 'ink', 'mono', 'reverse']

export function surfaceBackground(surface: LogoSurface, site: SiteColors): string {
  return surface === 'light' ? LIGHT_SURFACE : surface === 'dark' ? DARK_SURFACE : site.background
}

function pickFg(on: string): string {
  return contrastRatio(on, '#ffffff') >= contrastRatio(on, LIGHT_INK) ? '#ffffff' : LIGHT_INK
}

function legible(color: string, bg: string, min: number): string {
  if (contrastRatio(color, bg) >= min) return color
  return hexLuminance(bg) < 0.4 ? DARK_INK : LIGHT_INK
}

export function resolveColorway(id: ColorwayId, site: SiteColors, surface: LogoSurface = 'site'): LogoColors {
  if (id === 'reverse') {
    return { a: site.primaryFg, b: site.primaryFg, ink: site.primaryFg, fg: site.primary, canvas: site.primary }
  }
  const bg = surfaceBackground(surface, site)
  const pairs: Record<Exclude<ColorwayId, 'reverse'>, [string, string, string]> = {
    brand: [site.primary, site.accent, site.foreground],
    swap: [site.accent, site.primary, site.foreground],
    ink: [site.foreground, site.primary, site.foreground],
    mono: [site.primary, site.primary, site.primary],
  }
  const [a0, b0, ink0] = pairs[id]
  const a = legible(a0, bg, 3)
  const b = legible(b0, bg, 2.2)
  const ink = legible(ink0, bg, 4.5)
  return { a, b, ink, fg: pickFg(a) }
}
