import { emblemBounds, type EmblemAsset, type TextAssets } from '@/lib/logo-studio/compose'
import { LIGHT_SURFACE, styleSpec, type LogoColors, type LogoStyleId } from '@/lib/logo-studio/rules'
import type { Box } from '@/lib/logo-studio/ttf'

/**
 * Favicons are EMBLEM-ONLY: a square canvas with the emblem centred inside a
 * 10-15 % padding, never the whole horizontal lockup. When the emblem would
 * not read at 32 px (too many shapes/curves, typical of AI drawings) the brand
 * initial is used as a monogram instead. Pure string work, testable in node.
 */

export const FAVICON_PNG_SIZES = [16, 32, 48, 180, 512] as const
export type FaviconKind = 'emblem' | 'monogram'
export type FaviconPrefer = 'auto' | FaviconKind

/** Above this score an emblem is considered too detailed for 32 px. */
export const FAVICON_MAX_COMPLEXITY = 70

/** Shape count x4 plus path commands/points: a cheap proxy for visual detail. */
export function emblemComplexity(inner: string): number {
  const shapes = (inner.match(/<(path|circle|ellipse|rect|polygon|polyline|line)\b/g) ?? []).length
  let detail = 0
  for (const m of inner.matchAll(/\sd="([^"]*)"/g)) detail += (m[1].match(/[MLHVCSQTAZmlhvcsqtaz]/g) ?? []).length
  for (const m of inner.matchAll(/\spoints="([^"]*)"/g)) detail += (m[1].match(/[\d.]+[\s,]+[\d.]+/g) ?? []).length
  return shapes * 4 + detail
}

export function isFaviconReadable(e: EmblemAsset): boolean {
  return emblemComplexity(e.simple ?? e.inner) <= FAVICON_MAX_COMPLEXITY
}

/** Padding share per side: tighter for tiny sizes, roomier for touch icons (10-15 %). */
export function faviconPadding(size: number): number {
  return size <= 32 ? 0.1 : size <= 48 ? 0.12 : 0.15
}

export type FaviconInput = {
  emblem: EmblemAsset | null
  text: TextAssets
  colors: LogoColors
  style: LogoStyleId
  prefer?: FaviconPrefer
}

export function resolveFaviconKind({ emblem, prefer = 'auto' }: Pick<FaviconInput, 'emblem' | 'prefer'>): FaviconKind {
  if (!emblem || prefer === 'monogram') return 'monogram'
  if (prefer === 'emblem') return 'emblem'
  return isFaviconReadable(emblem) ? 'emblem' : 'monogram'
}

export type FaviconSvg = {
  svg: string
  kind: FaviconKind
  size: number
  padding: number
  /** The placed content in the 100x100 canvas. */
  box: Box
}

const f = (n: number) => String(Math.round(n * 100) / 100)

export function buildFaviconSvg(input: FaviconInput, size: number, background: string | null = null): FaviconSvg {
  const kind = resolveFaviconKind(input)
  const padding = faviconPadding(size)
  const content = 100 * (1 - 2 * padding)
  const origin = (100 - content) / 2
  const bg = background ? `<rect width="100" height="100" fill="${background}"/>` : ''
  let body: string
  let box: Box = { x: origin, y: origin, w: content, h: content }

  if (kind === 'emblem' && input.emblem) {
    const e = input.emblem
    const inner = e.simple ?? e.inner
    const b = e.simple ? { x: 0, y: 0, w: 100, h: 100 } : emblemBounds(e)
    const scale = Math.min(content / b.w, content / b.h)
    const w = b.w * scale
    const h = b.h * scale
    const x = (100 - w) / 2
    const y = (100 - h) / 2
    box = { x, y, w, h }
    body = `<g transform="translate(${f(x - b.x * scale)} ${f(y - b.y * scale)}) scale(${f(scale)})">${inner}</g>`
  } else {
    const spec = styleSpec(input.style)
    const rx = spec.simpleFrame === 'disc' ? content / 2 : content * 0.26
    const m = input.text.initial
    const scale = Math.min((content * 0.62) / Math.max(m.bbox.w, 1), (content * 0.54) / Math.max(m.bbox.h, 1))
    const tx = 50 - (m.bbox.x + m.bbox.w / 2) * scale
    const ty = 50 - (m.bbox.y + m.bbox.h / 2) * scale
    body =
      `<rect x="${f(origin)}" y="${f(origin)}" width="${f(content)}" height="${f(content)}" rx="${f(rx)}" fill="${input.colors.a}"/>` +
      `<path d="${m.d}" fill="${input.colors.fg}" transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})"/>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${bg}${body}</svg>`
  return { svg, kind, size, padding, box }
}

export type FaviconVariant = { name: string; size: number; svg: string; kind: FaviconKind }

const NAMES: Record<number, string> = {
  16: 'favicon-16x16.png',
  32: 'favicon-32x32.png',
  48: 'favicon-48x48.png',
  180: 'apple-touch-icon.png',
  512: 'favicon-512x512.png',
}

/** Every PNG of the favicon set; the apple-touch icon gets an opaque background. */
export function buildFaviconVariants(input: FaviconInput, appleBackground: string = LIGHT_SURFACE): FaviconVariant[] {
  return FAVICON_PNG_SIZES.map((size) => {
    const r = buildFaviconSvg(input, size, size === 180 ? appleBackground : null)
    return { name: NAMES[size], size, svg: r.svg, kind: r.kind }
  })
}
