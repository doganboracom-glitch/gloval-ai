import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { bundledFont, initialsOf } from '@/lib/logo-studio/font-source'
import { textToPath } from '@/lib/logo-studio/ttf'
import { buildIcon, buildLockup, type TextAssets } from '@/lib/logo-studio/compose'
import { localEmblems } from '@/lib/logo-studio/emblem-local'
import { buildPdf } from '@/lib/logo-studio/pdf'

const palette = { primary: '#6d28d9', accent: '#06b6d4', primaryFg: '#ffffff' }

function assetsFor(name: string): TextAssets {
  const font = bundledFont()
  return {
    plain: textToPath(font, name, { size: 100 }),
    caps: textToPath(font, name.toLocaleUpperCase('tr'), { size: 100, letterSpacing: 0.14 }),
    mono: textToPath(font, initialsOf(name), { size: 100 }),
    fauxBold: false,
  }
}

describe('logo studio', () => {
  it('typesets Turkish brand names with no missing glyphs', () => {
    const t = textToPath(bundledFont(), 'Çiğdem Şekerleme Öğütücü', { size: 100 })
    expect(t.missing).toBe(0)
    expect(t.d.length).toBeGreaterThan(100)
    expect(t.bbox.w).toBeGreaterThan(0)
  })

  it('derives initials', () => {
    expect(initialsOf('ışık Ahmet')).toBe('IA')
    expect(initialsOf('Gloval')).toBe('GL')
  })

  it('builds every layout as text-free vector SVG', () => {
    const text = assetsFor('Gloval Studio')
    const [a, b] = localEmblems({ count: 2, palette, brand: 'Gloval Studio', context: '', seed: 0 })
    for (const [layout, emblem] of [
      ['horizontal', a],
      ['vertical', b],
      ['wordmark', null],
    ] as const) {
      const l = buildLockup({ layout, emblem, text, ink: '#111111', palette })
      expect(l.svg.startsWith('<svg')).toBe(true)
      expect(l.svg).not.toMatch(/<text\b/i)
      expect(l.width).toBeGreaterThan(0)
      expect(l.height).toBeGreaterThan(0)
    }
    expect(buildIcon({ layout: 'horizontal', emblem: a, text, palette })).toContain('<svg')
  })

  it('rotates local emblems with the seed', () => {
    const ids = (seed: number) =>
      localEmblems({ count: 2, palette, brand: 'Acme', context: '', seed }).map((e) => e.id).join()
    expect(ids(0)).not.toBe(ids(1))
  })

  it('writes a structurally valid PDF', async () => {
    const pdf = await buildPdf({
      width: 2,
      height: 2,
      rgb: new Uint8Array(12),
      alpha: new Uint8Array(4),
      pageWidth: 100,
      pageHeight: 100,
      deflate: async (d) => new Uint8Array(deflateSync(d)),
    })
    const text = Buffer.from(pdf).toString('latin1')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    const startxref = Number(text.match(/startxref\n(\d+)/)?.[1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
  })
})
