import sharp from 'sharp'
import { sanitizeLogoSvg } from '@/lib/logo-svg'
import { EMBLEM_VIEWBOX, MAX_EMBLEM_SHAPES, TARGET_EMBLEM_SHAPES } from '@/lib/logo-studio/emblem-prompt'

/**
 * Safety + quality gate for LLM-drawn emblems. Everything a model returns is
 * untrusted: it is rejected when it carries anything active or external,
 * normalised (viewBox, colour tokens), sanitised with the shared allowlist and
 * finally rendered to check it is neither blank, a background nor unreadable.
 */

export const MAX_EMBLEM_BYTES = 20_000
const MIN_COVERAGE = 0.02
const MAX_COVERAGE = 0.94
const MIN_SMALL_COVERAGE = 0.015
/** More distinct colours than this outside the palette means the model ignored it. */
const MAX_OFF_PALETTE = 3

export type EmblemStats = {
  shapes: number
  bytes: number
  /** Distinct colours the model used outside the palette (before snapping). */
  offPalette: number
  coverage: number
  smallCoverage: number
}

export type EmblemVerdict =
  | { ok: true; svg: string; stats: EmblemStats; notes: string[] }
  | { ok: false; reason: string; stats?: EmblemStats }

/** Pulls the <svg> element out of a reply that may be wrapped in markdown fences. */
export function extractSvg(text: string): string | null {
  const m = text.match(/<svg[\s\S]*<\/svg\s*>/i)
  return m ? m[0] : null
}

const FORBIDDEN_ELEMENT =
  /<\s*(script|foreignObject|image|use|iframe|object|embed|style|animate\w*|set|defs|linearGradient|radialGradient|pattern|clipPath|mask|filter|symbol|marker|a)\b/i

/** Returns the reason an untrusted SVG must be thrown away, or null when it is clean. */
export function unsafeReason(svg: string): string | null {
  const probe = svg.replace(/\sxmlns(?::\w+)?\s*=\s*("[^"]*"|'[^']*')/gi, '')
  if (/<\s*script\b|javascript:/i.test(probe)) return 'betik içeriyor'
  if (/\son[a-z]+\s*=/i.test(probe)) return 'olay özniteliği içeriyor'
  if (/\b(?:xlink:)?href\s*=|<\s*(?:foreignObject|image|use|iframe|object|embed)\b|data:|https?:|\/\//i.test(probe)) {
    return 'harici referans içeriyor'
  }
  if (/url\s*\(/i.test(probe)) return 'url() / degrade / kırpma kullanıyor'
  const el = probe.match(FORBIDDEN_ELEMENT)
  if (el) return `izin verilmeyen öğe (${el[1]})`
  return null
}

function number(v: string | undefined): number | null {
  if (!v) return null
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/** Rewrites the root to `viewBox="0 0 200 200"`, scaling and centring content from any other box. */
export function normalizeViewBox(svg: string): string | null {
  const root = svg.match(/<svg\b([^>]*)>/i)
  const close = svg.toLowerCase().lastIndexOf('</svg')
  if (!root || root.index === undefined || close < 0) return null
  const attrs = root[1]
  const inner = svg.slice(root.index + root[0].length, close)

  const vb = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
  const parts = vb?.trim().split(/[\s,]+/).map(Number)
  let minX = 0
  let minY = 0
  let w = EMBLEM_VIEWBOX
  let h = EMBLEM_VIEWBOX
  if (parts && parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    ;[minX, minY, w, h] = parts
  } else {
    const aw = number(attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1])
    const ah = number(attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1])
    if (aw && ah && aw > 0 && ah > 0) {
      w = aw
      h = ah
    }
  }

  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${EMBLEM_VIEWBOX} ${EMBLEM_VIEWBOX}">`
  if (minX === 0 && minY === 0 && w === EMBLEM_VIEWBOX && h === EMBLEM_VIEWBOX) return `${head}${inner}</svg>`
  const s = Math.min(EMBLEM_VIEWBOX / w, EMBLEM_VIEWBOX / h)
  const tx = (EMBLEM_VIEWBOX - w * s) / 2 - minX * s
  const ty = (EMBLEM_VIEWBOX - h * s) / 2 - minY * s
  const r = (n: number) => Number(n.toFixed(3))
  return `${head}<g transform="translate(${r(tx)} ${r(ty)}) scale(${r(s)})">${inner}</g></svg>`
}

type Rgb = [number, number, number]

const NAMED: Record<string, Rgb> = { white: [255, 255, 255], black: [0, 0, 0] }

function parseHex(v: string): Rgb | null {
  const h = v.trim().replace(/^#/, '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(h)) return null
  const full = h.length === 3 ? h.replace(/./g, '$&$&') : h
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb
}

function parseColor(v: string): Rgb | null {
  const t = v.trim().toLowerCase()
  const hex = parseHex(t)
  if (hex) return hex
  const rgb = t.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return NAMED[t] ?? null
}

function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Snaps every fill/stroke to the nearest palette colour, written as the exact
 * lowercase hex the studio's recolouring (Marka / Ters / Koyu yazı / Tek renk)
 * swaps. Elements without a paint inherit the primary colour from a wrapper.
 */
export function snapToPalette(svg: string, palette: string[]): { svg: string; offPalette: number } | null {
  const tokens = palette.map((p) => parseHex(p)).filter((c): c is Rgb => c !== null)
  if (tokens.length === 0) return null
  const tokenHex = tokens.map(hexOf)
  const off = new Set<string>()

  const snapped = svg.replace(/\b(fill|stroke)\s*=\s*"([^"]*)"/gi, (_m, attr: string, value: string) => {
    const v = value.trim().toLowerCase()
    if (v === 'none' || v === 'transparent') return `${attr}="none"`
    const color = v === 'currentcolor' ? tokens[0] : parseColor(v)
    if (!color) {
      off.add(v)
      return `${attr}="${tokenHex[0]}"`
    }
    const hex = hexOf(color)
    if (!tokenHex.includes(hex)) off.add(hex)
    let best = 0
    let bestDist = Infinity
    tokens.forEach((t, i) => {
      const d = (t[0] - color[0]) ** 2 + (t[1] - color[1]) ** 2 + (t[2] - color[2]) ** 2
      if (d < bestDist) {
        best = i
        bestDist = d
      }
    })
    return `${attr}="${tokenHex[best]}"`
  })

  const open = snapped.match(/<svg\b[^>]*>/i)
  if (!open || open.index === undefined) return null
  const at = open.index + open[0].length
  const close = snapped.toLowerCase().lastIndexOf('</svg')
  const wrapped = `${snapped.slice(0, at)}<g fill="${tokenHex[0]}">${snapped.slice(at, close)}</g></svg>`
  return { svg: wrapped, offPalette: off.size }
}

const SHAPE_TAG = /<(path|circle|ellipse|rect|line|polyline|polygon)\b/gi

/** True when a rect nearly as large as the box is drawn (a background in disguise). */
function hasBackgroundRect(svg: string): boolean {
  for (const m of svg.matchAll(/<rect\b([^>]*)>/gi)) {
    const a = m[1]
    const w = number(a.match(/\bwidth\s*=\s*"([^"]*)"/i)?.[1]) ?? 0
    const h = number(a.match(/\bheight\s*=\s*"([^"]*)"/i)?.[1]) ?? 0
    const x = number(a.match(/\bx\s*=\s*"([^"]*)"/i)?.[1]) ?? 0
    const y = number(a.match(/\by\s*=\s*"([^"]*)"/i)?.[1]) ?? 0
    const filled = !/\bfill\s*=\s*"none"/i.test(a)
    if (filled && w >= 190 && h >= 190 && x <= 10 && y <= 10) return true
  }
  return false
}

async function paintedShare(svg: string, size: number): Promise<number> {
  const { data, info } = await sharp(Buffer.from(svg), { density: 96 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let painted = 0
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 24) painted++
  return painted / (info.width * info.height)
}

/**
 * Full gate. `palette` is the list of hex colours the emblem may use (one for
 * single-colour mode, two otherwise). The returned `svg` is safe to store and
 * only ever contains palette colours.
 */
export async function checkEmblemSvg(raw: string, palette: string[]): Promise<EmblemVerdict> {
  const found = extractSvg(raw)
  if (!found) return { ok: false, reason: 'svg bulunamadı' }

  const unsafe = unsafeReason(found)
  if (unsafe) return { ok: false, reason: unsafe }
  if (/<\s*text\b/i.test(found)) return { ok: false, reason: 'metin içeriyor' }

  const normalized = normalizeViewBox(found)
  if (!normalized) return { ok: false, reason: 'viewBox normalize edilemedi' }

  const clean = sanitizeLogoSvg(normalized, 'square', { allowText: false })
  if (!clean) return { ok: false, reason: 'temizleyici reddetti (bozuk/boş/çok büyük)' }

  const snapped = snapToPalette(clean, palette)
  if (!snapped) return { ok: false, reason: 'palet çözülemedi' }
  const svg = snapped.svg

  const shapes = (svg.match(SHAPE_TAG) ?? []).length
  const bytes = Buffer.byteLength(svg, 'utf8')
  if (bytes > MAX_EMBLEM_BYTES) return { ok: false, reason: `çok büyük (${bytes} bayt)` }
  if (shapes === 0) return { ok: false, reason: 'şekil yok' }
  if (shapes > MAX_EMBLEM_SHAPES) return { ok: false, reason: `çok karmaşık (${shapes} şekil)` }
  if (hasBackgroundRect(svg)) return { ok: false, reason: 'arka plan dolduruyor' }

  let coverage: number
  let smallCoverage: number
  try {
    coverage = await paintedShare(svg, 256)
    smallCoverage = await paintedShare(svg, 24)
  } catch {
    return { ok: false, reason: 'render edilemedi' }
  }
  const stats: EmblemStats = { shapes, bytes, offPalette: snapped.offPalette, coverage, smallCoverage }

  if (coverage < MIN_COVERAGE) return { ok: false, reason: 'boş çıktı', stats }
  if (coverage > MAX_COVERAGE) return { ok: false, reason: 'tüm alanı dolduruyor (arka plan?)', stats }
  if (smallCoverage < MIN_SMALL_COVERAGE) return { ok: false, reason: '24px’te okunmuyor', stats }
  if (snapped.offPalette > MAX_OFF_PALETTE) return { ok: false, reason: 'palet dışı renk kullanıyor', stats }

  const notes: string[] = []
  if (shapes > TARGET_EMBLEM_SHAPES) notes.push(`${shapes} şekil (hedef ≤${TARGET_EMBLEM_SHAPES})`)
  return { ok: true, svg, stats, notes }
}
