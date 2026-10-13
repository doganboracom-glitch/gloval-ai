import type { Box, TextPath } from '@/lib/logo-studio/ttf'
import { PROPORTIONS, styleSpec, type LogoColors, type LogoStyleId } from '@/lib/logo-studio/rules'

/**
 * Pure logo composition. Takes ready-made pieces (an emblem WITHOUT text, and
 * the brand name already converted to vector outlines) and lays them out as
 * three different lockups, each tightly cropped with even padding. All
 * proportion and alignment numbers come from `rules.ts`.
 *
 * Everything here is deterministic string/number work so it can be unit tested
 * and re-run in the browser to recolour a logo for a light or dark surface.
 */

export type LogoLayout = 'horizontal' | 'vertical' | 'wordmark'

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
  const pad = e.source === 'ai' ? maxStrokeWidth(e.inner) / 2 : 0
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

type Placed = { markup: string; box: Box }

function placeEmblem(e: EmblemAsset, x: number, y: number, scale: number): Placed {
  const b = emblemBounds(e)
  const tx = x - b.x * scale
  const ty = y - b.y * scale
  return {
    markup: `<g transform="translate(${f(tx)} ${f(ty)}) scale(${f(scale)})">${e.inner}</g>`,
    box: { x, y, w: b.w * scale, h: b.h * scale },
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
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}">` +
    `<g transform="translate(${f(dx)} ${f(dy)})">${parts.map((p) => p.markup).join('')}</g></svg>`
  return { layout, svg, width, height, emblemBox: move(meta.emblem), textCapBox: move(meta.textCap) }
}

export type BuildLockupInput = {
  layout: LogoLayout
  emblem: EmblemAsset | null
  text: TextAssets
  colors: LogoColors
  style: LogoStyleId
}

export function buildLockup({ layout, emblem, text, colors, style }: BuildLockupInput): Lockup {
  const spec = styleSpec(style)
  const P = PROPORTIONS
  const ink = colors.ink
  const label = spec.textCase === 'caps' ? text.caps : text.plain
  const capH = label.capHeight
  const overshoot = (e: EmblemAsset) => (e.round ? P.roundOvershoot : 1)

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
    return finish(layout, [e, t], { emblem: e.box, textCap: { x: pw + gap, y: baseline - capH, w: label.bbox.w, h: capH } })
  }

  if (layout === 'vertical' && emblem) {
    const ts = P.vertical.textScale
    const tcap = text.caps.capHeight * ts
    const eb = emblemBounds(emblem)
    const targetH = tcap * P.vertical.emblemToTextCap * spec.emblemScale
    const scale =
      Math.min(targetH / eb.h, (targetH * P.vertical.maxEmblemAspect) / eb.w) * overshoot(emblem)
    const ph = eb.h * scale
    const pw = eb.w * scale
    const textW = text.caps.bbox.w * ts
    const W = Math.max(pw, textW)
    const H = Math.max(targetH, ph)
    const e = placeEmblem(emblem, (W - pw) / 2, (H - ph) / 2, scale)
    const baseline = H + tcap * P.vertical.gapToTextCap * spec.gapScale + tcap
    const t = placeText(text.caps, text.fauxBold, ink, (W - textW) / 2, baseline, ts)
    return finish(layout, [e, t], { emblem: e.box, textCap: { x: (W - textW) / 2, y: baseline - tcap, w: textW, h: tcap } })
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
  return finish('wordmark', [t, bar], { textCap: { x: 0, y: 0, w: label.bbox.w, h: capH } })
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
