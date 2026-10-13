import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildTextAssets, bundledFont, initialsOf, loadHeadingFont } from '@/lib/logo-studio/font-source'
import { textToPath } from '@/lib/logo-studio/ttf'
import { buildLockup, type TextAssets } from '@/lib/logo-studio/compose'
import { LOCAL_EMBLEM_COUNT, localEmblems } from '@/lib/logo-studio/emblem-local'
import { buildPdf } from '@/lib/logo-studio/pdf'
import { resolveColorway } from '@/lib/logo-studio/rules'

const palette = { primary: '#6d28d9', accent: '#06b6d4', primaryFg: '#ffffff' }
const siteColors = { primary: '#6d28d9', primaryFg: '#ffffff', accent: '#06b6d4', foreground: '#111111', background: '#ffffff' }

function assetsFor(name: string): TextAssets {
  const font = bundledFont()
  return {
    plain: textToPath(font, name, { size: 100 }),
    caps: textToPath(font, name.toLocaleUpperCase('tr'), { size: 100, letterSpacing: 0.14 }),
    mono: textToPath(font, initialsOf(name), { size: 100 }),
    initial: textToPath(font, name.slice(0, 1).toLocaleUpperCase('tr'), { size: 100 }),
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
      for (const style of ['modern', 'classic', 'minimal', 'luxury'] as const) {
        const l = buildLockup({ layout, emblem, text, colors: resolveColorway('brand', siteColors), style })
        expect(l.svg.startsWith('<svg')).toBe(true)
        expect(l.svg).not.toMatch(/<text\b/i)
        expect(l.width).toBeGreaterThan(0)
        expect(l.height).toBeGreaterThan(0)
      }
    }
  })

  it('rotates local emblems with the seed', () => {
    const ids = (seed: number) =>
      localEmblems({ count: 2, palette, brand: 'Acme', context: '', seed }).map((e) => e.id).join()
    expect(ids(0)).not.toBe(ids(1))
  })

  it('ships at least 40 distinct local emblems', () => {
    expect(LOCAL_EMBLEM_COUNT).toBeGreaterThanOrEqual(40)
    const seen = new Set<string>()
    for (let seed = 0; seed < LOCAL_EMBLEM_COUNT; seed++) {
      for (const e of localEmblems({ count: 1, palette, brand: 'Acme', context: '', seed })) seen.add(e.inner)
    }
    expect(seen.size).toBeGreaterThanOrEqual(40)
  })

  it('gives different brands in the same sector different first suggestions', () => {
    const brands = ['Yıldız Dental', 'Mavi Klinik', 'Aksoy Diş', 'Güneş Polikliniği', 'Nova Sağlık', 'Dr. Kaya', 'Elit Dental', 'Ada Klinik']
    const first = new Set(
      brands.map(
        (brand) =>
          localEmblems({ count: 3, palette, brand, context: 'diş kliniği', seed: 0 }).map((e) => e.inner).join('|'),
      ),
    )
    expect(first.size).toBeGreaterThanOrEqual(5)
  })

  it('is deterministic for the same brand and sector', () => {
    const run = () => localEmblems({ count: 3, palette, brand: 'Acme', context: 'cafe', seed: 2 }).map((e) => e.id)
    expect(run()).toEqual(run())
  })

  it('falls back to the bundled font when Google Fonts is unreachable', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    try {
      expect(await loadHeadingFont('Unreachable Offline Family')).toBeNull()
      const { assets, fontName } = await buildTextAssets('Çiğdem Café', 'luxury')
      expect(fontName).toMatch(/poppins/i)
      expect(assets.plain.d.length).toBeGreaterThan(100)
      expect(assets.plain.missing).toBe(0)
    } finally {
      globalThis.fetch = original
    }
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
