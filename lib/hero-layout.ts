import type { Section } from '@/lib/website-schema'

type HeroData = Extract<Section, { type: 'hero' }>

export type HeroLayout = 'split' | 'light-cover' | 'full-bleed'
export type HeroAlign = 'left' | 'center' | 'right'
export type HeroImageFit = 'contain' | 'cover'

export const HERO_LAYOUTS: readonly HeroLayout[] = ['split', 'light-cover', 'full-bleed']
export const DEFAULT_HERO_OVERLAY = 40
export const MAX_HERO_OVERLAY = 70

export type ResolvedHeroLayout = {
  layout: HeroLayout
  align: HeroAlign
  overlay: number
  imageFit: HeroImageFit
}

/** Minimum hero heights (px): desktop split/light-cover, full-bleed, mobile. */
export const HERO_MIN_HEIGHT = { desktop: 560, fullBleed: 640, mobile: 420 } as const

/**
 * `layout` unset means the owner never picked a style: the renderer keeps the
 * legacy `variant` output untouched. Anything unrecognised is treated as unset.
 */
export function hasHeroLayout(hero: Pick<HeroData, 'layout'>): boolean {
  return HERO_LAYOUTS.includes(hero.layout as HeroLayout)
}

export function clampOverlay(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_HERO_OVERLAY
  return Math.min(MAX_HERO_OVERLAY, Math.max(0, Math.round(n)))
}

/** Alignment is only allowed to be "center" on full-bleed; elsewhere it falls back to "left". */
export function normalizeAlign(layout: HeroLayout, align: unknown): HeroAlign {
  if (align === 'right') return 'right'
  if (align === 'center' && layout === 'full-bleed') return 'center'
  return 'left'
}

export function resolveHeroLayout(
  hero: Pick<HeroData, 'layout' | 'align' | 'overlay' | 'imageFit'>,
): ResolvedHeroLayout {
  const layout: HeroLayout = hasHeroLayout(hero) ? (hero.layout as HeroLayout) : 'split'
  return {
    layout,
    align: normalizeAlign(layout, hero.align),
    overlay: clampOverlay(hero.overlay),
    imageFit: hero.imageFit === 'cover' ? 'cover' : 'contain',
  }
}

/* -------------------------------------------------------------------------- */
/*  Contrast (WCAG 2.x)                                                       */
/* -------------------------------------------------------------------------- */

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Smallest black opacity behind the text that keeps white text at >= 4.5:1
 * even over a pure-white photo (the worst case): need background luminance
 * <= 0.183, i.e. a gray of ~118/255, i.e. alpha >= ~0.54. 0.56 adds margin.
 */
export const TEXT_ZONE_MIN_ALPHA = 0.56

/** Black opacity directly behind the text for a given overlay setting (0-70). */
export function textZoneAlpha(overlay: number): number {
  const a = clampOverlay(overlay) / 100
  return Math.min(0.9, Math.max(TEXT_ZONE_MIN_ALPHA, a + 0.2))
}

/**
 * Worst-case contrast of white text over a photo with a black layer of
 * `alpha` opacity when the photo itself is at its brightest (pure white).
 */
export function whiteTextContrastOverBrightPhoto(alpha: number): number {
  const v = 255 * (1 - Math.min(1, Math.max(0, alpha)))
  return contrastRatio(1, luminance(v, v, v))
}

/**
 * Full-bleed scrim. The overlay slider sets how dark the image is overall; the
 * zone behind the copy never drops below `textZoneAlpha`, so the 4.5:1 text
 * contrast holds for any photo and any slider value.
 */
export function overlayGradient(align: HeroAlign, overlay: number): string {
  const a = clampOverlay(overlay) / 100
  const text = textZoneAlpha(overlay)
  if (align === 'center') {
    return `radial-gradient(ellipse 75% 85% at 50% 50%, rgba(0,0,0,${text}) 0%, rgba(0,0,0,${text}) 45%, rgba(0,0,0,${a}) 100%)`
  }
  const dir = align === 'right' ? 'to left' : 'to right'
  return `linear-gradient(${dir}, rgba(0,0,0,${text}) 0%, rgba(0,0,0,${text}) 45%, rgba(0,0,0,${a}) 100%)`
}
