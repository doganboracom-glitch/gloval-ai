/**
 * Minimal TrueType (glyf) reader used to turn logo text into vector paths.
 * -----------------------------------------------------------------------
 * A logo must not depend on a webfont being installed wherever the SVG is
 * opened (an SVG used through <img> cannot load external fonts). Converting
 * the brand name to outlines makes it a pure vector shape that looks the same
 * everywhere — header, favicon, PNG, PDF.
 *
 * Supports: cmap formats 4 and 12, simple + composite glyphs, hmtx advances.
 * Not supported (falls back to the bundled font via a thrown error): CFF
 * (.otf) outlines, kerning/GPOS shaping.
 */

export type Box = { x: number; y: number; w: number; h: number }

export type TtfFont = {
  unitsPerEm: number
  ascent: number
  descent: number
  /** Cap height as a fraction of the em (falls back to 0.7). */
  capRatio: number
  /** True for variable fonts: outlines are the default instance (usually Regular). */
  isVariable: boolean
  glyphIndex: (codePoint: number) => number
  advance: (glyph: number) => number
  outline: (glyph: number) => Pt[][]
}

export type Pt = { x: number; y: number; on: boolean }

export type TextPath = {
  /** SVG path data with the baseline on y = 0 and the pen origin on x = 0. */
  d: string
  /** Tight bounds of the drawn glyphs in the same coordinate space. */
  bbox: Box
  /** Pen advance of the whole run (includes trailing letter-spacing removed). */
  advance: number
  /** Cap height in output units (for optical vertical centring). */
  capHeight: number
  /** Number of characters that had no glyph in the font. */
  missing: number
}

const f2 = (n: number) => String(Math.round(n * 100) / 100)

export function parseTtf(data: Uint8Array): TtfFont {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const u16 = (o: number) => view.getUint16(o)
  const i16 = (o: number) => view.getInt16(o)
  const u32 = (o: number) => view.getUint32(o)

  const tag = (o: number) => String.fromCharCode(data[o], data[o + 1], data[o + 2], data[o + 3])
  const sfnt = u32(0)
  if (sfnt !== 0x00010000 && tag(0) !== 'true') throw new Error('unsupported font container')

  const tables = new Map<string, number>()
  const numTables = u16(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    tables.set(tag(rec), u32(rec + 8))
  }
  const need = (name: string) => {
    const o = tables.get(name)
    if (o === undefined) throw new Error(`missing table ${name}`)
    return o
  }

  const head = need('head')
  const unitsPerEm = u16(head + 18)
  const locaLong = i16(head + 50) === 1
  const maxp = need('maxp')
  const numGlyphs = u16(maxp + 4)
  const hhea = need('hhea')
  const ascent = i16(hhea + 4)
  const descent = i16(hhea + 6)
  const numHMetrics = u16(hhea + 34)
  const hmtx = need('hmtx')
  const loca = need('loca')
  const glyf = need('glyf')

  let capRatio = 0.7
  const os2 = tables.get('OS/2')
  if (os2 !== undefined && u16(os2) >= 2) {
    const cap = i16(os2 + 88)
    if (cap > 0) capRatio = cap / unitsPerEm
  }

  const glyphOffset = (g: number) =>
    locaLong ? u32(loca + g * 4) : u16(loca + g * 2) * 2

  /* ---- cmap ------------------------------------------------------------ */
  const cmapOff = need('cmap')
  const nSub = u16(cmapOff + 2)
  let best = -1
  let bestScore = -1
  for (let i = 0; i < nSub; i++) {
    const rec = cmapOff + 4 + i * 8
    const platform = u16(rec)
    const encoding = u16(rec + 2)
    const off = cmapOff + u32(rec + 4)
    const format = u16(off)
    if (format !== 4 && format !== 12) continue
    let score = 0
    if (platform === 3 && encoding === 10) score = 4
    else if (platform === 0 && format === 12) score = 3
    else if (platform === 3 && encoding === 1) score = 2
    else if (platform === 0) score = 1
    if (score > bestScore) {
      best = off
      bestScore = score
    }
  }
  if (best < 0) throw new Error('no usable cmap')
  const cmapFormat = u16(best)

  const glyphIndex = (cp: number): number => {
    if (cmapFormat === 12) {
      const groups = u32(best + 12)
      let lo = 0
      let hi = groups - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const g = best + 16 + mid * 12
        const start = u32(g)
        const end = u32(g + 4)
        if (cp < start) hi = mid - 1
        else if (cp > end) lo = mid + 1
        else return u32(g + 8) + (cp - start)
      }
      return 0
    }
    if (cp > 0xffff) return 0
    const segX2 = u16(best + 6)
    const endO = best + 14
    const startO = endO + segX2 + 2
    const deltaO = startO + segX2
    const rangeO = deltaO + segX2
    for (let i = 0; i < segX2; i += 2) {
      if (cp > u16(endO + i)) continue
      const start = u16(startO + i)
      if (cp < start) return 0
      const delta = i16(deltaO + i)
      const range = u16(rangeO + i)
      if (range === 0) return (cp + delta) & 0xffff
      const gi = u16(rangeO + i + range + (cp - start) * 2)
      return gi === 0 ? 0 : (gi + delta) & 0xffff
    }
    return 0
  }

  const advance = (g: number): number => {
    const idx = Math.min(g, numHMetrics - 1)
    return u16(hmtx + idx * 4)
  }

  /* ---- outlines -------------------------------------------------------- */
  const outline = (g: number, depth = 0): Pt[][] => {
    if (g < 0 || g >= numGlyphs || depth > 6) return []
    const start = glyphOffset(g)
    const end = glyphOffset(g + 1)
    if (end <= start) return []
    let o = glyf + start
    const nContours = i16(o)
    o += 10

    if (nContours >= 0) {
      const endPts: number[] = []
      for (let i = 0; i < nContours; i++) {
        endPts.push(u16(o))
        o += 2
      }
      const nPts = nContours === 0 ? 0 : endPts[nContours - 1] + 1
      o += 2 + u16(o) // skip instructions
      const flags: number[] = []
      while (flags.length < nPts) {
        const fl = data[o++]
        flags.push(fl)
        if (fl & 8) {
          let rep = data[o++]
          while (rep-- > 0) flags.push(fl)
        }
      }
      const xs: number[] = []
      let x = 0
      for (let i = 0; i < nPts; i++) {
        const fl = flags[i]
        if (fl & 2) {
          const dx = data[o++]
          x += fl & 16 ? dx : -dx
        } else if (!(fl & 16)) {
          x += i16(o)
          o += 2
        }
        xs.push(x)
      }
      const ys: number[] = []
      let y = 0
      for (let i = 0; i < nPts; i++) {
        const fl = flags[i]
        if (fl & 4) {
          const dy = data[o++]
          y += fl & 32 ? dy : -dy
        } else if (!(fl & 32)) {
          y += i16(o)
          o += 2
        }
        ys.push(y)
      }
      const contours: Pt[][] = []
      let s = 0
      for (const e of endPts) {
        const c: Pt[] = []
        for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) === 1 })
        contours.push(c)
        s = e + 1
      }
      return contours
    }

    // Composite glyph.
    const out: Pt[][] = []
    let more = true
    while (more) {
      const flags = u16(o)
      const comp = u16(o + 2)
      o += 4
      let dx = 0
      let dy = 0
      if (flags & 1) {
        if (flags & 2) {
          dx = i16(o)
          dy = i16(o + 2)
        }
        o += 4
      } else {
        if (flags & 2) {
          dx = view.getInt8(o)
          dy = view.getInt8(o + 1)
        }
        o += 2
      }
      let a = 1
      let b = 0
      let c = 0
      let d = 1
      const f214 = (p: number) => i16(p) / 16384
      if (flags & 8) {
        a = d = f214(o)
        o += 2
      } else if (flags & 0x40) {
        a = f214(o)
        d = f214(o + 2)
        o += 4
      } else if (flags & 0x80) {
        a = f214(o)
        b = f214(o + 2)
        c = f214(o + 4)
        d = f214(o + 6)
        o += 8
      }
      for (const contour of outline(comp, depth + 1)) {
        out.push(
          contour.map((p) => ({
            x: a * p.x + c * p.y + dx,
            y: b * p.x + d * p.y + dy,
            on: p.on,
          })),
        )
      }
      more = (flags & 0x20) !== 0
    }
    return out
  }

  return {
    unitsPerEm,
    ascent,
    descent,
    capRatio,
    isVariable: tables.has('fvar'),
    glyphIndex,
    advance,
    outline: (g) => outline(g),
  }
}

function contourToPath(pts: Pt[], map: (p: Pt) => [number, number]): string {
  const n = pts.length
  if (n < 2) return ''
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true })
  const firstOn = pts.findIndex((p) => p.on)
  let start: Pt
  let seq: Pt[]
  if (firstOn === -1) {
    start = mid(pts[0], pts[n - 1])
    seq = pts
  } else {
    start = pts[firstOn]
    seq = [...pts.slice(firstOn + 1), ...pts.slice(0, firstOn)]
  }
  const pair = (p: Pt) => {
    const [x, y] = map(p)
    return `${f2(x)} ${f2(y)}`
  }
  let d = `M${pair(start)}`
  let ctrl: Pt | null = null
  for (const p of seq) {
    if (p.on) {
      d += ctrl ? `Q${pair(ctrl)} ${pair(p)}` : `L${pair(p)}`
      ctrl = null
    } else {
      if (ctrl) d += `Q${pair(ctrl)} ${pair(mid(ctrl, p))}`
      ctrl = p
    }
  }
  if (ctrl) d += `Q${pair(ctrl)} ${pair(start)}`
  return d + 'Z'
}

/**
 * Lays `text` out on one line and returns it as SVG path data.
 * `size` is the em size in output units; `letterSpacing` is in em fractions.
 */
export function textToPath(
  font: TtfFont,
  text: string,
  { size = 100, letterSpacing = 0 }: { size?: number; letterSpacing?: number } = {},
): TextPath {
  const scale = size / font.unitsPerEm
  let penX = 0
  let missing = 0
  let d = ''
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity

  const chars = Array.from(text.normalize('NFC'))
  chars.forEach((ch, i) => {
    const cp = ch.codePointAt(0) ?? 0
    const g = font.glyphIndex(cp)
    if (g === 0 && ch.trim() !== '') missing += 1
    const ox = penX
    const map = (p: Pt): [number, number] => [ox + p.x * scale, -p.y * scale]
    for (const contour of font.outline(g)) {
      d += contourToPath(contour, map)
      for (const p of contour) {
        const [x, y] = map(p)
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    penX += font.advance(g) * scale
    if (i < chars.length - 1) penX += letterSpacing * size
  })

  const empty = !Number.isFinite(x0)
  return {
    d,
    bbox: empty ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    advance: penX,
    capHeight: font.capRatio * size,
    missing,
  }
}
