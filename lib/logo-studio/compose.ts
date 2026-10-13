import type { Box, TextPath } from '@/lib/logo-studio/ttf'

/**
 * Pure logo composition. Takes ready-made pieces (an emblem WITHOUT text, and
 * the brand name already converted to vector outlines) and lays them out as
 * three different lockups, each tightly cropped with even padding.
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
}

export type TextAssets = {
  /** The brand name as typed. */
  plain: TextPath
  /** Upper-case, letter-spaced variant (used by the stacked layout). */
  caps: TextPath
  /** One or two initials for the square icon. */
  mono: TextPath
  /** Variable fonts only give Regular outlines; emulate bold with a stroke. */
  fauxBold: boolean
}

export type LogoPalette = { primary: string; accent: string; primaryFg: string }

export type Lockup = {
  layout: LogoLayout
  svg: string
  width: number
  height: number
}

const f = (n: number) => String(Math.round(n * 100) / 100)
const FAUX_BOLD_STROKE = 2.4

export function hexLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Ink (wordmark colour) that stays readable on the given preview surface. */
export function inkForSurface(
  surface: 'light' | 'dark',
  siteForeground: string,
): string {
  if (surface === 'dark') return '#f8fafc'
  return hexLuminance(siteForeground) < 0.35 ? siteForeground : '#111827'
}

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
function finish(layout: LogoLayout, parts: Placed[]): Lockup {
  const content = union(parts.map((p) => p.box))
  const pad = Math.max(6, Math.min(content.w, content.h) * 0.12)
  const width = content.w + pad * 2
  const height = content.h + pad * 2
  const shift = `translate(${f(pad - content.x)} ${f(pad - content.y)})`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}">` +
    `<g transform="${shift}">${parts.map((p) => p.markup).join('')}</g></svg>`
  return { layout, svg, width, height }
}

export type BuildLockupInput = {
  layout: LogoLayout
  emblem: EmblemAsset | null
  text: TextAssets
  ink: string
  palette: LogoPalette
}

export function buildLockup({ layout, emblem, text, ink, palette }: BuildLockupInput): Lockup {
  const capH = text.plain.capHeight

  if (layout === 'horizontal' && emblem) {
    const eb = emblemBounds(emblem)
    const targetH = capH * 2.3
    const scale = Math.min(targetH / eb.h, (targetH * 1.5) / eb.w)
    const ph = eb.h * scale
    const pw = eb.w * scale
    const e = placeEmblem(emblem, 0, (targetH - ph) / 2, scale)
    const gap = capH * 0.6
    const t = placeText(text.plain, text.fauxBold, ink, pw + gap, targetH / 2 + capH / 2, 1)
    return finish(layout, [e, t])
  }

  if (layout === 'vertical' && emblem) {
    const ts = 0.62
    const tcap = capH * ts
    const eb = emblemBounds(emblem)
    const targetH = tcap * 4.6
    const scale = Math.min(targetH / eb.h, (targetH * 1.3) / eb.w)
    const ph = eb.h * scale
    const pw = eb.w * scale
    const textW = text.caps.bbox.w * ts
    const W = Math.max(pw, textW)
    const e = placeEmblem(emblem, (W - pw) / 2, (targetH - ph) / 2, scale)
    const baseline = targetH + tcap * 1.15 + tcap
    const t = placeText(text.caps, text.fauxBold, ink, (W - textW) / 2, baseline, ts)
    return finish(layout, [e, t])
  }

  // Wordmark: typography plus a short accent bar; also the fallback when a
  // lockup that needs an emblem was requested without one.
  const t = placeText(text.plain, text.fauxBold, ink, 0, capH, 1)
  const barW = Math.max(24, text.plain.bbox.w * 0.2)
  const barH = Math.max(4, capH * 0.1)
  const barY = capH + capH * 0.42
  const bar: Placed = {
    markup: `<rect x="0" y="${f(barY)}" width="${f(barW)}" height="${f(barH)}" rx="${f(barH / 2)}" fill="${palette.accent}"/>`,
    box: { x: 0, y: barY, w: barW, h: barH },
  }
  return finish('wordmark', [t, bar])
}

/** Square icon (favicon-style): the emblem, or an initials badge for wordmarks. */
export function buildIcon({
  layout,
  emblem,
  text,
  palette,
}: Omit<BuildLockupInput, 'ink'>): string {
  const size = 100
  let body: string
  if (layout !== 'wordmark' && emblem) {
    const eb = emblemBounds(emblem)
    const box = size * 0.84
    const scale = Math.min(box / eb.w, box / eb.h)
    const placed = placeEmblem(
      emblem,
      (size - eb.w * scale) / 2,
      (size - eb.h * scale) / 2,
      scale,
    )
    body = placed.markup
  } else {
    const m = text.mono
    const maxW = size * 0.6
    const maxH = size * 0.42
    const scale = Math.min(maxW / Math.max(m.bbox.w, 1), maxH / Math.max(m.bbox.h, 1))
    const cx = size / 2 - (m.bbox.x + m.bbox.w / 2) * scale
    const cy = size / 2 - (m.bbox.y + m.bbox.h / 2) * scale
    body =
      `<rect width="${size}" height="${size}" rx="22" fill="${palette.primary}"/>` +
      `<path d="${m.d}" fill="${palette.primaryFg}" transform="translate(${f(cx)} ${f(cy)}) scale(${f(scale)})"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`
}
