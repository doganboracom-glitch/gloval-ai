/**
 * Concept families and similarity fingerprints for V2 AI emblem rounds.
 *
 * Each candidate of a round is asked for a DIFFERENT concept family, and the
 * delivered marks are compared with a cheap fingerprint (shape count, shape
 * types, tone distribution, coverage and a coarse occupancy grid). A candidate
 * that is too close to an earlier one is dropped and redrawn, never charged.
 */

export type ConceptFamily = { id: string; text: string }

export const CONCEPT_FAMILIES: readonly ConceptFamily[] = [
  {
    id: 'pictorial',
    text: 'a pictorial sector symbol: one recognisable object of the trade drawn as a bold simplified picture',
  },
  {
    id: 'geometric',
    text: 'an abstract geometric mark derived from a metaphor of the business (growth, shelter, flow, precision), built only from basic shapes, no literal object',
  },
  {
    id: 'letter-shape',
    text: 'a letterform-inspired shape: an outer container shape whose geometry hints at the first letter of the brand WITHOUT drawing any actual letter, digit or text',
  },
  {
    id: 'negative-space',
    text: 'a negative-space mark: one solid shape in which the empty space (real gaps, not white fills) forms the hidden second image of the business',
  },
  {
    id: 'seal',
    text: 'a seal or badge: a ring or shield shaped border with a small trade symbol centred inside, no text',
  },
  {
    id: 'accent-glyph',
    text: 'a wordmark accent glyph: a compact decorative ligature-like flourish that could sit beside or above a typeset name, abstract and without any letters',
  },
]

export function conceptFor(index: number, seed: number): ConceptFamily {
  return CONCEPT_FAMILIES[(index + seed) % CONCEPT_FAMILIES.length]
}

/* ------------------------------ fingerprint ------------------------------ */

const GRID = 8
const VIEW = 200
const TAGS = ['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'] as const

export type Fingerprint = {
  shapes: number
  types: number[]
  tones: Map<string, number>
  coverage: number
  grid: boolean[]
}

type Rect = { x0: number; y0: number; x1: number; y1: number }

function numbers(text: string): number[] {
  return (text.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number).filter(Number.isFinite)
}

function pathBox(d: string): Rect | null {
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const xs: number[] = []
  const ys: number[] = []
  const push = (px: number, py: number) => {
    xs.push(px)
    ys.push(py)
  }
  for (const m of d.matchAll(re)) {
    const cmd = m[1]
    const args = numbers(m[2])
    const rel = cmd === cmd.toLowerCase()
    const up = cmd.toUpperCase()
    if (up === 'Z') {
      x = startX
      y = startY
      continue
    }
    const step = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 }[up] ?? 2
    for (let i = 0; i + step <= args.length; i += step) {
      const a = args.slice(i, i + step)
      const baseX = x
      const baseY = y
      if (up === 'H') {
        x = rel ? baseX + a[0] : a[0]
      } else if (up === 'V') {
        y = rel ? baseY + a[0] : a[0]
      } else {
        // Control points count toward the box; the last pair becomes the new point.
        const first = up === 'A' ? 5 : 0
        for (let k = first; k + 1 < a.length; k += 2) {
          const px = rel ? baseX + a[k] : a[k]
          const py = rel ? baseY + a[k + 1] : a[k + 1]
          if (k + 2 >= a.length) {
            x = px
            y = py
          } else {
            push(px, py)
          }
        }
        if (up === 'M' && i === 0) {
          startX = x
          startY = y
        }
      }
      push(x, y)
    }
  }
  if (xs.length === 0) return null
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}=["']([^"']*)["']`).exec(tag)?.[1]
}

function shapeBox(tag: string, type: string): Rect | null {
  const n = (name: string) => Number(attr(tag, name) ?? 0)
  switch (type) {
    case 'rect':
      return { x0: n('x'), y0: n('y'), x1: n('x') + n('width'), y1: n('y') + n('height') }
    case 'circle':
      return { x0: n('cx') - n('r'), y0: n('cy') - n('r'), x1: n('cx') + n('r'), y1: n('cy') + n('r') }
    case 'ellipse':
      return { x0: n('cx') - n('rx'), y0: n('cy') - n('ry'), x1: n('cx') + n('rx'), y1: n('cy') + n('ry') }
    case 'line':
      return {
        x0: Math.min(n('x1'), n('x2')),
        y0: Math.min(n('y1'), n('y2')),
        x1: Math.max(n('x1'), n('x2')),
        y1: Math.max(n('y1'), n('y2')),
      }
    case 'polygon':
    case 'polyline': {
      const pts = numbers(attr(tag, 'points') ?? '')
      const xs = pts.filter((_, i) => i % 2 === 0)
      const ys = pts.filter((_, i) => i % 2 === 1)
      return xs.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : null
    }
    default:
      return pathBox(attr(tag, 'd') ?? '')
  }
}

/** Fingerprint of an emblem's inner SVG markup (viewBox 0..200). */
export function fingerprintEmblem(inner: string): Fingerprint {
  const types = TAGS.map(() => 0)
  const tones = new Map<string, number>()
  const grid = Array<boolean>(GRID * GRID).fill(false)
  let shapes = 0
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  for (const m of inner.matchAll(/<(path|circle|ellipse|rect|polygon|polyline|line)\b[^>]*>/gi)) {
    const type = m[1].toLowerCase()
    const tag = m[0]
    shapes++
    types[TAGS.indexOf(type as (typeof TAGS)[number])]++
    const tone = (attr(tag, 'fill') ?? attr(tag, 'stroke') ?? 'none').toLowerCase()
    tones.set(tone, (tones.get(tone) ?? 0) + 1)
    const box = shapeBox(tag, type)
    if (!box) continue
    const clamp = (v: number) => Math.min(VIEW, Math.max(0, v))
    const bx0 = clamp(box.x0)
    const by0 = clamp(box.y0)
    const bx1 = clamp(box.x1)
    const by1 = clamp(box.y1)
    x0 = Math.min(x0, bx0)
    y0 = Math.min(y0, by0)
    x1 = Math.max(x1, bx1)
    y1 = Math.max(y1, by1)
    const cell = VIEW / GRID
    for (let gx = Math.floor(bx0 / cell); gx <= Math.min(GRID - 1, Math.floor(bx1 / cell)); gx++) {
      for (let gy = Math.floor(by0 / cell); gy <= Math.min(GRID - 1, Math.floor(by1 / cell)); gy++) {
        grid[gy * GRID + gx] = true
      }
    }
  }
  const coverage = x1 > x0 && y1 > y0 ? ((x1 - x0) * (y1 - y0)) / (VIEW * VIEW) : 0
  return { shapes, types, tones, coverage, grid }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** 0 = nothing in common, 1 = indistinguishable. */
export function emblemSimilarity(a: Fingerprint, b: Fingerprint): number {
  const toneKeys = [...new Set([...a.tones.keys(), ...b.tones.keys()])]
  const tone = cosine(
    toneKeys.map((k) => a.tones.get(k) ?? 0),
    toneKeys.map((k) => b.tones.get(k) ?? 0),
  )
  const type = cosine(a.types, b.types)
  const count = 1 - Math.abs(a.shapes - b.shapes) / Math.max(a.shapes, b.shapes, 1)
  const cover = 1 - Math.abs(a.coverage - b.coverage)
  let both = 0
  let either = 0
  for (let i = 0; i < a.grid.length; i++) {
    if (a.grid[i] && b.grid[i]) both++
    if (a.grid[i] || b.grid[i]) either++
  }
  const layout = either ? both / either : 1
  return 0.15 * tone + 0.2 * type + 0.15 * count + 0.1 * cover + 0.4 * layout
}

/** Marks scoring at or above this against an earlier candidate are dropped and redrawn. */
export const SIMILARITY_LIMIT = 0.9

export function tooSimilar(candidate: Fingerprint, kept: Fingerprint[]): boolean {
  return kept.some((other) => emblemSimilarity(candidate, other) >= SIMILARITY_LIMIT)
}
