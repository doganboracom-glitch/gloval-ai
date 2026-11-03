import type { Box, TextPath } from '@/lib/logo-studio/ttf'
import {
  contrastRatio,
  hexLuminance,
  METALLIC_TOKEN_COLORS,
  PROPORTIONS,
  styleSpec,
  type LogoColors,
  type LogoMetalTone,
  type LogoStyleId,
} from '@/lib/logo-studio/rules'

/**
 * Pure logo composition. Takes ready-made pieces (an emblem WITHOUT text, and
 * the brand name already converted to vector outlines) and lays them out as
 * three different lockups, each tightly cropped with even padding. All
 * proportion and alignment numbers come from `rules.ts`.
 *
 * Everything here is deterministic string/number work so it can be unit tested
 * and re-run in the browser to recolour a logo for a light or dark surface.
 */

export type LogoLayout = 'horizontal' | 'vertical' | 'wordmark' | 'stacked' | 'badge'
export const LEGACY_LOGO_LAYOUTS: readonly LogoLayout[] = ['horizontal', 'vertical', 'wordmark']
export const LOGO_LAYOUTS_V2: readonly LogoLayout[] = [...LEGACY_LOGO_LAYOUTS, 'stacked', 'badge']

export type EmblemAsset = {
  id: string
  source: 'ai' | 'local'
  /** SVG children (no root element, never contains <text>). */
  inner: string
  viewBox: { w: number; h: number }
  /** Content bounds in viewBox space. Measured in the browser for AI emblems. */
  bbox?: Box
  /** Round silhouettes get an optical size boost so they match squares. */
  round?: boolean
  /** Simplified, badge-like markup (100x100) that stays legible at 16-32 px. */
  simple?: string
  /** Trusted-compositor definitions; never accepted from model output. */
  svgDefs?: string
  metallic?: boolean
  metalTone?: LogoMetalTone
}

export type TextAssets = {
  /** The brand name as typed. */
  plain: TextPath
  /** Upper-case, letter-spaced variant (stacked layout, luxury style). */
  caps: TextPath
  /** One or two initials for the monogram. */
  mono: TextPath
  /** The first letter only (favicon monogram). */
  initial: TextPath
  /** Variable fonts only give Regular outlines; emulate bold with a stroke. */
  fauxBold: boolean
}

/** The site's own palette, as sent to the AI prompt. */
export type LogoPalette = { primary: string; accent: string; primaryFg: string }

export type Lockup = {
  layout: LogoLayout
  svg: string
  width: number
  height: number
  /** Placed emblem / text cap-height boxes in svg coordinates (for alignment checks). */
  emblemBox?: Box
  textCapBox?: Box
}

const f = (n: number) => String(Math.round(n * 100) / 100)
const FAUX_BOLD_STROKE = 2.4

export { hexLuminance } from '@/lib/logo-studio/rules'

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Splits sanitised SVG markup into its viewBox and inner markup. */
export function splitSvg(svg: string): { inner: string; w: number; h: number } | null {
  const open = svg.match(/<svg\b[^>]*>/i)
  const close = svg.lastIndexOf('</svg')
  if (!open || close < 0) return null
  const vb = open[0].match(/viewBox="([^"]+)"/i)?.[1].trim().split(/[\s,]+/).map(Number)
  if (!vb || vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) return null
  const inner = svg.slice((open.index ?? 0) + open[0].length, close)
  return { inner, w: vb[2], h: vb[3] }
}

function maxStrokeWidth(inner: string): number {
  let max = 0
  for (const m of inner.matchAll(/stroke-width="([\d.]+)"/g)) max = Math.max(max, Number(m[1]))
  return max
}

/** Emblem bounds including half the widest stroke (getBBox ignores strokes). */
export function emblemBounds(e: EmblemAsset): Box {
  const base = e.bbox && e.bbox.w > 0 && e.bbox.h > 0 ? e.bbox : { x: 0, y: 0, w: e.viewBox.w, h: e.viewBox.h }
  const pad = (e.source === 'ai' ? maxStrokeWidth(e.inner) / 2 : 0) + (e.metallic ? 4 : 0)
  return { x: base.x - pad, y: base.y - pad, w: base.w + 2 * pad, h: base.h + 2 * pad }
}

/**
 * Re-colours an AI emblem by swapping exact hex values (single pass, so a->b
 * and b->a swaps never chain). Local emblems are redrawn instead.
 */
export function recolorEmblem(e: EmblemAsset, map: Record<string, string>): EmblemAsset {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]))
  const inner = e.inner.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => lower[m.toLowerCase()] ?? m)
  return { ...e, inner }
}

const METAL_TONE_BY_TOKEN = Object.fromEntries(
  Object.entries(METALLIC_TOKEN_COLORS).map(([tone, color]) => [color.toLowerCase(), tone]),
) as Record<string, keyof typeof METALLIC_TOKEN_COLORS>

const METAL_STOPS: Record<LogoMetalTone, Record<keyof typeof METALLIC_TOKEN_COLORS, readonly [string, string, string, string]>> = {
  gold: {
    light: ['#fff9df', '#f2d67d', '#b27a22', '#fff0b4'],
    mid: ['#f5dc83', '#c39435', '#835415', '#e9c35f'],
    dark: ['#bf8328', '#80511b', '#4d2d10', '#b77921'],
  },
  silver: {
    light: ['#ffffff', '#eef2f5', '#aab4be', '#ffffff'],
    mid: ['#f5f7f9', '#c0c8d0', '#75818c', '#dce2e7'],
    dark: ['#aab3bc', '#68737d', '#343c44', '#9aa5af'],
  },
  bronze: {
    light: ['#f5d2a4', '#d6a16c', '#8c512d', '#f0c18e'],
    mid: ['#d5a06a', '#a96d3e', '#66391e', '#c88a55'],
    dark: ['#a46a3c', '#6b3f24', '#422514', '#91562e'],
  },
}

function metalSafeId(id: string): string {
  return `logo-metal-${id.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'mark'}`
}

function mapMetalTokens(inner: string, map: (tone: keyof typeof METALLIC_TOKEN_COLORS, attribute: string) => string): string {
  return inner.replace(/(fill|stroke)="(#[0-9a-f]{6})"/gi, (match, attribute: string, color: string) => {
    const tone = METAL_TONE_BY_TOKEN[color.toLowerCase()]
    return tone ? `${attribute}="${map(tone, attribute)}"` : match
  })
}

type MetalStops = Record<keyof typeof METALLIC_TOKEN_COLORS, readonly [string, string, string, string]>

/** WCAG non-text contrast: a metallic mark must reach this against the surface it sits on. */
export const MIN_METAL_CONTRAST = 3

function mixHex(from: string, to: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Metal stops adapted to a surface. On a light surface pale tones (silver,
 * white-gold highlights) would vanish, so each shade is shifted toward black
 * until its body stop (index 1) reaches `MIN_METAL_CONTRAST`; on a dark surface
 * the shift goes toward white. `contour` is set when a shift was needed and the
 * compositor then also draws a thin contrasting edge.
 */
export function metalStopsForSurface(
  tone: LogoMetalTone,
  surface?: string,
): { stops: MetalStops; contour?: string; minContrast: number } {
  const base = METAL_STOPS[tone]
  const shades = Object.keys(base) as (keyof typeof METALLIC_TOKEN_COLORS)[]
  const bodyContrast = (stops: MetalStops) => Math.min(...shades.map((shade) => contrastRatio(stops[shade][1], surface ?? '#ffffff')))
  if (!surface) return { stops: base, minContrast: bodyContrast(base) }

  const toward = hexLuminance(surface) >= 0.4 ? '#000000' : '#ffffff'
  const stops = {} as MetalStops
  let shifted = false
  for (const shade of shades) {
    let amount = 0
    const at = (t: number) => base[shade].map((color) => mixHex(color, toward, t)) as unknown as MetalStops[typeof shade]
    while (amount < 1 && contrastRatio(at(amount)[1], surface) < MIN_METAL_CONTRAST) amount = Math.round((amount + 0.05) * 100) / 100
    if (amount > 0) shifted = true
    stops[shade] = at(amount)
  }
  const contour = shifted ? (toward === '#000000' ? base.dark[2] : base.light[0]) : undefined
  return { stops, contour, minContrast: bodyContrast(stops) }
}

function metallicDefinitions(id: string, tone: LogoMetalTone, palette: MetalStops = METAL_STOPS[tone]): string {
  const gradients = (Object.keys(METALLIC_TOKEN_COLORS) as (keyof typeof METALLIC_TOKEN_COLORS)[])
    .map((shade) => {
      const colors = palette[shade]
      const stops = colors.map((color, index) => `<stop offset="${index * 33.333}%" stop-color="${color}"/>`).join('')
      return `<linearGradient id="${id}-${shade}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`
    })
    .join('')
  return `${gradients}<linearGradient id="${id}-highlight" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff" stop-opacity=".18"/><stop offset="45%" stop-color="#fff" stop-opacity=".78"/><stop offset="100%" stop-color="#fff" stop-opacity=".08"/></linearGradient><filter id="${id}-shadow" x="-24%" y="-24%" width="148%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="1.25" result="blur"/><feOffset in="blur" dy="1.35" result="offset"/><feComponentTransfer in="offset" result="shadow"><feFuncA type="linear" slope=".24"/></feComponentTransfer><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
}

/** Applies gradients, a soft shadow and a fine edge highlight only after SVG gate/local generation. */
export function applyMetallicFinish(e: EmblemAsset, tone: LogoMetalTone, surface?: string): EmblemAsset {
  const id = metalSafeId(e.id)
  const adapted = surface ? metalStopsForSurface(tone, surface) : null
  const palette = adapted?.stops ?? METAL_STOPS[tone]
  const main = mapMetalTokens(e.inner, (shade) => `url(#${id}-${shade})`)
  const edge = adapted?.contour
    ? `stroke="${adapted.contour}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".9"`
    : `stroke="url(#${id}-highlight)" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".3"`
  const inner = `<g filter="url(#${id}-shadow)" ${edge}>${main}</g>`

  const simple = e.simple
    ? mapMetalTokens(e.simple, (shade) => palette[shade][1])
    : undefined
  return {
    ...e,
    inner,
    simple,
    svgDefs: metallicDefinitions(id, tone, palette),
    metallic: true,
    metalTone: tone,
  }
}

type Placed = { markup: string; box: Box; defs?: string }

function placeEmblem(e: EmblemAsset, x: number, y: number, scale: number): Placed {
  const b = emblemBounds(e)
  const tx = x - b.x * scale
  const ty = y - b.y * scale
  return {
    markup: `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})">${e.inner}</g>`,
    box: { x, y, w: b.w * scale, h: b.h * scale },
    defs: e.svgDefs,
  }
}

function placeText(
  t: TextPath,
  fauxBold: boolean,
  ink: string,
  x: number,
  baselineY: number,
  scale: number,
): Placed {
  const sw = fauxBold ? FAUX_BOLD_STROKE : 0
  const stroke = sw ? ` stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"` : ''
  const markup = `<path d="${t.d}" fill="${ink}"${stroke} transform="translate(${f(x - t.bbox.x * scale)} ${f(baselineY)}) scale(${f(scale)})"/>`
  return {
    markup,
    box: {
      x: x - (sw / 2) * scale,
      y: baselineY + t.bbox.y * scale - (sw / 2) * scale,
      w: t.bbox.w * scale + sw * scale,
      h: t.bbox.h * scale + sw * scale,
    },
  }
}

function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Wraps placed parts in a tightly-cropped svg with even padding on every side. */
function finish(
  layout: LogoLayout,
  parts: Placed[],
  meta: { emblem?: Box; textCap?: Box } = {},
): Lockup {
  const content = union(parts.map((p) => p.box))
  const pad = Math.max(PROPORTIONS.padMin, Math.min(content.w, content.h) * PROPORTIONS.padRatio)
  const width = content.w + pad * 2
  const height = content.h + pad * 2
  const dx = pad - content.x
  const dy = pad - content.y
  const move = (b?: Box): Box | undefined => (b ? { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h } : undefined)
  const defs = [...new Set(parts.map((part) => part.defs).filter((value): value is string => !!value))]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    `<g transform="translate(${f(dx)} ${f(dy)})">${parts.map((p) => p.markup).join('')}</g></svg>`
  return { layout, svg, width, height, emblemBox: move(meta.emblem), textCapBox: move(meta.textCap) }
}

const BADGE_INNER_RING = 43.5
const BADGE_RING_MARGIN = 1.5
const BADGE_MIN_TAG_SCALE = 0.05

/** True when all four corners of the box lie inside the badge's inner ring. */
export function insideBadgeRing(box: Box): boolean {
  return [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ].every(([x, y]) => Math.hypot(x - 50, y - 50) <= BADGE_INNER_RING - BADGE_RING_MARGIN)
}

export type BuildLockupInput = {
  layout: LogoLayout
  emblem: EmblemAsset | null
  text: TextAssets
  colors: LogoColors
  style: LogoStyleId
  sectorLabel?: TextPath
}

export function buildLockup({ layout, emblem, text, colors, style, sectorLabel }: BuildLockupInput): Lockup {
  const spec = styleSpec(style)
  const P = PROPORTIONS
  const ink = colors.ink
  const label = spec.textCase === 'caps' ? text.caps : text.plain
  const capH = label.capHeight
  const overshoot = (e: EmblemAsset) => (e.round ? P.roundOvershoot : 1)
  const placeSectorTag = (centerX: number, anchor: Box, maxWidth: number, preferredScale: number): Placed | null => {
    if (!sectorLabel) return null
    const scale = Math.min(preferredScale, maxWidth / Math.max(sectorLabel.bbox.w, 1))
    const width = sectorLabel.bbox.w * scale
    const cap = sectorLabel.capHeight * scale
    const baseline = anchor.y + anchor.h + Math.max(2, capH * 0.08) + cap
    return placeText(sectorLabel, false, ink, centerX - width / 2, baseline, scale)
  }

  if (layout === 'horizontal' && emblem) {
    const eb = emblemBounds(emblem)
    const targetH = capH * P.horizontal.emblemToCap * spec.emblemScale
    const scale =
      Math.min(targetH / eb.h, (targetH * P.horizontal.maxEmblemAspect) / eb.w) * overshoot(emblem)
    const ph = eb.h * scale
    const pw = eb.w * scale
    const H = Math.max(targetH, ph)
    const cy = H / 2
    const e = placeEmblem(emblem, 0, cy - ph / 2, scale)
    const gap = capH * P.horizontal.gapToCap * spec.gapScale
    const baseline = cy + capH / 2
    const t = placeText(label, text.fauxBold, ink, pw + gap, baseline, 1)
    const tag = placeSectorTag(pw + gap + label.bbox.w / 2, t.box, Math.max(label.bbox.w, capH * 2.4), 0.22)
    return finish(layout, tag ? [e, t, tag] : [e, t], { emblem: e.box, textCap: { x: pw + gap, y: baseline - capH, w: label.bbox.w, h: capH } })
  }

  if ((layout === 'vertical' || layout === 'stacked') && emblem) {
    const proportions = layout === 'stacked' ? P.stacked : P.vertical
    const ts = proportions.textScale
    const tcap = text.caps.capHeight * ts
    const eb = emblemBounds(emblem)
    const targetH = tcap * proportions.emblemToTextCap * spec.emblemScale
    const scale =
      Math.min(targetH / eb.h, (targetH * proportions.maxEmblemAspect) / eb.w) * overshoot(emblem)
    const ph = eb.h * scale
    const pw = eb.w * scale
    const textW = text.caps.bbox.w * ts
    const W = Math.max(pw, textW)
    const H = Math.max(targetH, ph)
    const e = placeEmblem(emblem, (W - pw) / 2, (H - ph) / 2, scale)
    const baseline = H + tcap * proportions.gapToTextCap * spec.gapScale + tcap
    const textX = (W - textW) / 2
    const t = placeText(text.caps, text.fauxBold, ink, textX, baseline, ts)
    const tag = placeSectorTag(W / 2, t.box, Math.max(W, tcap * 2.5), 0.2)
    return finish(layout, tag ? [e, t, tag] : [e, t], { emblem: e.box, textCap: { x: textX, y: baseline - tcap, w: textW, h: tcap } })
  }

  if (layout === 'badge' && emblem) {
    const frame: Placed = {
      markup: `<circle cx="50" cy="50" r="48" fill="none" stroke="${colors.a}" stroke-width="2.4"/><circle cx="50" cy="50" r="43.5" fill="none" stroke="${colors.b}" stroke-width="0.8"/>`,
      box: { x: 0, y: 0, w: 100, h: 100 },
    }
    const eb = emblemBounds(emblem)
    const iconScale = Math.min(32 / eb.w, 32 / eb.h) * overshoot(emblem)
    const iconW = eb.w * iconScale
    const e = placeEmblem(emblem, 50 - iconW / 2, 8, iconScale)
    let textScale = Math.min(74 / Math.max(label.bbox.w, 1), 12 / Math.max(label.bbox.h, 1))
    const baseline = 66
    let t = placeText(label, text.fauxBold, ink, 50 - (label.bbox.w * textScale) / 2, baseline, textScale)
    // Shrink until every corner of the text box sits inside the inner ring.
    for (let i = 0; i < 30 && !insideBadgeRing(t.box); i++) {
      textScale *= 0.94
      t = placeText(label, text.fauxBold, ink, 50 - (label.bbox.w * textScale) / 2, baseline, textScale)
    }
    const textW = label.bbox.w * textScale
    let tag: Placed | null = null
    if (sectorLabel) {
      let tagScale = Math.min(0.15, 70 / Math.max(sectorLabel.bbox.w, 1))
      for (let i = 0; i < 30 && tagScale >= BADGE_MIN_TAG_SCALE; i++) {
        const tagBaseline = t.box.y + t.box.h + 2.5 + sectorLabel.capHeight * tagScale
        const placed = placeText(sectorLabel, false, ink, 50 - (sectorLabel.bbox.w * tagScale) / 2, tagBaseline, tagScale)
        if (insideBadgeRing(placed.box)) {
          tag = placed
          break
        }
        tagScale *= 0.94
      }
    }
    const textCap = { x: 50 - textW / 2, y: baseline - label.capHeight * textScale, w: textW, h: label.capHeight * textScale }
    return finish(layout, tag ? [frame, e, t, tag] : [frame, e, t], { emblem: e.box, textCap })
  }

  // Wordmark: typography plus a short accent bar; also the fallback when a
  // lockup that needs an emblem was requested without one.
  const W = P.wordmark
  const t = placeText(label, text.fauxBold, ink, 0, capH, 1)
  const barW = Math.max(W.barMinWidth, label.bbox.w * W.barWidthRatio)
  const barH = Math.max(4, capH * W.barHeightToCap)
  const barY = capH + capH * W.barGapToCap
  const bar: Placed = {
    markup: `<rect x="0" y="${f(barY)}" width="${f(barW)}" height="${f(barH)}" rx="${f(barH / 2)}" fill="${colors.b}"/>`,
    box: { x: 0, y: barY, w: barW, h: barH },
  }
  const tag = placeSectorTag(label.bbox.w / 2, bar.box, Math.max(label.bbox.w, capH * 2.4), 0.22)
  return finish('wordmark', tag ? [t, bar, tag] : [t, bar], { textCap: { x: 0, y: 0, w: label.bbox.w, h: capH } })
}

/**
 * Monogram emblem: initials inside a circle or square badge. Filled for the
 * modern/classic styles, outlined for minimal/luxury.
 */
export function monogramEmblem({
  mono,
  shape,
  colors,
  style,
}: {
  mono: TextPath
  shape: 'circle' | 'square'
  colors: LogoColors
  style: LogoStyleId
}): EmblemAsset {
  const spec = styleSpec(style)
  const w = spec.ringWeight
  const filled = spec.monogramFilled
  const badge =
    shape === 'circle'
      ? filled
        ? `<circle cx="50" cy="50" r="50" fill="${colors.a}"/>`
        : `<circle cx="50" cy="50" r="${f(50 - w / 2)}" fill="none" stroke="${colors.a}" stroke-width="${w}"/>`
      : filled
        ? `<rect width="100" height="100" rx="14" fill="${colors.a}"/>`
        : `<rect x="${f(w / 2)}" y="${f(w / 2)}" width="${f(100 - w)}" height="${f(100 - w)}" rx="10" fill="none" stroke="${colors.a}" stroke-width="${w}"/>`
  const letterColor = filled ? colors.fg : colors.a
  const maxW = 60
  const maxH = 38
  const scale = Math.min(maxW / Math.max(mono.bbox.w, 1), maxH / Math.max(mono.bbox.h, 1))
  const cx = 50 - (mono.bbox.x + mono.bbox.w / 2) * scale
  const cy = 50 - (mono.bbox.y + mono.bbox.h / 2) * scale
  const letters = `<path d="${mono.d}" fill="${letterColor}" transform="translate(${f(cx)} ${f(cy)}) scale(${f(scale)})"/>`
  return {
    id: `monogram-${shape}`,
    source: 'local',
    inner: badge + letters,
    viewBox: { w: 100, h: 100 },
    bbox: { x: 0, y: 0, w: 100, h: 100 },
    round: shape === 'circle',
  }
}
