/**
 * SVG logo sanitiser
 * ------------------
 * Model output is UNTRUSTED and ends up rendered in customers' sites, so it is
 * rebuilt from an element/attribute allowlist (`sanitizeLogoSvg`): scripts,
 * event handlers, external references and anything unrecognised are dropped
 * rather than escaped. The emblem pipeline lives in `lib/logo-studio/`.
 */

export type LogoSvgFormat = 'horizontal' | 'square' | 'vertical'

const MAX_SVG_BYTES = 40_000
const MAX_ELEMENTS = 300

const VIEWBOX: Record<LogoSvgFormat, { w: number; h: number }> = {
  square: { w: 256, h: 256 },
  horizontal: { w: 640, h: 240 },
  vertical: { w: 320, h: 480 },
}

/* -------------------------------------------------------------------------- */
/*  Sanitiser                                                                 */
/* -------------------------------------------------------------------------- */

// Canonical (correctly cased) names, keyed by their lowercase form.
const ALLOWED_TAGS: Record<string, string> = {
  svg: 'svg',
  g: 'g',
  defs: 'defs',
  path: 'path',
  circle: 'circle',
  ellipse: 'ellipse',
  rect: 'rect',
  line: 'line',
  polyline: 'polyline',
  polygon: 'polygon',
  text: 'text',
  tspan: 'tspan',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  stop: 'stop',
  clippath: 'clipPath',
  title: 'title',
}

const DRAWABLE = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
])

const ALLOWED_ATTRS: Record<string, string> = {
  id: 'id',
  d: 'd',
  cx: 'cx',
  cy: 'cy',
  r: 'r',
  rx: 'rx',
  ry: 'ry',
  x: 'x',
  y: 'y',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  dx: 'dx',
  dy: 'dy',
  width: 'width',
  height: 'height',
  points: 'points',
  transform: 'transform',
  fill: 'fill',
  stroke: 'stroke',
  'stroke-width': 'stroke-width',
  'stroke-linecap': 'stroke-linecap',
  'stroke-linejoin': 'stroke-linejoin',
  'stroke-miterlimit': 'stroke-miterlimit',
  'stroke-dasharray': 'stroke-dasharray',
  opacity: 'opacity',
  'fill-opacity': 'fill-opacity',
  'stroke-opacity': 'stroke-opacity',
  'fill-rule': 'fill-rule',
  'clip-rule': 'clip-rule',
  'clip-path': 'clip-path',
  offset: 'offset',
  'stop-color': 'stop-color',
  'stop-opacity': 'stop-opacity',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  viewbox: 'viewBox',
  'font-family': 'font-family',
  'font-size': 'font-size',
  'font-weight': 'font-weight',
  'letter-spacing': 'letter-spacing',
  'text-anchor': 'text-anchor',
  'dominant-baseline': 'dominant-baseline',
}

// Blocks whose *content* must go too (a bare tag allowlist would leave the text).
const STRIP_BLOCKS =
  /<(script|style|foreignObject|metadata|desc|animate|animateTransform|set)\b[\s\S]*?<\/\1\s*>/gi

const TAG_RE = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g
const ATTR_RE = /([a-zA-Z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function safeAttrValue(name: string, value: string): string | null {
  const v = value.trim()
  if (!v || v.length > 2000) return null
  if (/javascript:|data:|https?:|&#|[<>]|expression\(/i.test(v)) return null
  if (/url\(/i.test(v) && !/^url\(#[\w-]+\)$/.test(v)) return null
  if (name === 'font-family' && !/^[\w\s,'-]+$/.test(v)) return null
  return v
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function cleanText(text: string): string {
  return text
    .replace(/[<>]/g, '')
    .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;')
}

function parseViewBox(value: string | undefined): [number, number] | null {
  if (!value) return null
  const n = value.trim().split(/[\s,]+/).map(Number)
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null
  const [minX, minY, w, h] = n
  if (minX !== 0 || minY !== 0 || w <= 0 || h <= 0 || w > 4000 || h > 4000) return null
  return [w, h]
}

/**
 * Rebuilds model output as a minimal, script-free SVG, or returns `null` when it
 * is not usable (no svg, malformed nesting, nothing drawn, oversized).
 * Exported for tests.
 */
export function sanitizeLogoSvg(
  raw: string,
  format: LogoSvgFormat = 'square',
  { allowText = true }: { allowText?: boolean } = {},
): string | null {
  const found = raw.match(/<svg[\s\S]*<\/svg\s*>/i)
  if (!found) return null

  // Emblem-only callers: any <text> is removed together with its content, so a
  // model that ignores the "no lettering" rule cannot smuggle the brand name in.
  const withoutText = allowText
    ? found[0]
    : found[0].replace(/<text\b[\s\S]*?<\/text\s*>/gi, '').replace(/<text\b[^>]*\/>/gi, '')

  const source = withoutText
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(STRIP_BLOCKS, '')

  const stack: string[] = []
  let out = ''
  let last = 0
  let elements = 0
  let drawn = false
  let sawRoot = false

  for (const m of source.matchAll(TAG_RE)) {
    out += cleanText(source.slice(last, m.index))
    last = m.index + m[0].length

    const closing = m[1] === '/'
    const canon = ALLOWED_TAGS[m[2].toLowerCase()]
    if (!canon) continue // unknown element: drop the tag, keep going

    if (closing) {
      if (stack.pop() !== canon) return null
      out += `</${canon}>`
      continue
    }

    elements += 1
    if (elements > MAX_ELEMENTS) return null
    if (canon === 'svg') {
      if (sawRoot) return null // nested <svg> is not allowed
      sawRoot = true
    } else if (!sawRoot) {
      return null // content before the root
    }
    if (DRAWABLE.has(canon)) drawn = true

    const attrs = new Map<string, string>()
    for (const a of m[3].matchAll(ATTR_RE)) {
      const name = ALLOWED_ATTRS[a[1].toLowerCase()]
      if (!name) continue
      const value = safeAttrValue(name, a[2] ?? a[3] ?? '')
      if (value !== null) attrs.set(name, value)
    }

    if (canon === 'svg') {
      const fallback = VIEWBOX[format]
      const [w, h] = parseViewBox(attrs.get('viewBox')) ?? [fallback.w, fallback.h]
      attrs.clear()
      attrs.set('xmlns', 'http://www.w3.org/2000/svg')
      attrs.set('viewBox', `0 0 ${w} ${h}`)
      // Explicit size so the browser reports a natural size to the canvas fitter.
      attrs.set('width', String(w))
      attrs.set('height', String(h))
    }

    const rendered = [...attrs].map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')
    const selfClosing = /\/\s*$/.test(m[3])
    out += `<${canon}${rendered ? ` ${rendered}` : ''}${selfClosing ? '/>' : '>'}`
    if (!selfClosing) stack.push(canon)
  }
  out += cleanText(source.slice(last))

  if (stack.length > 0 || !sawRoot || !drawn) return null
  if (Buffer.byteLength(out, 'utf8') > MAX_SVG_BYTES) return null
  return out
}
