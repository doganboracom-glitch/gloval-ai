import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildTextAssets, bundledFont, initialsOf, loadHeadingFont } from '@/lib/logo-studio/font-source'
import { textToPath } from '@/lib/logo-studio/ttf'
import { buildLockup, type TextAssets } from '@/lib/logo-studio/compose'
import { EMBLEM_LIBRARY, LOCAL_EMBLEM_COUNT, SECTOR_IDS, localEmblems } from '@/lib/logo-studio/emblem-local'
import { FAVICON_PNG_SIZES, buildFaviconSvg, buildFaviconVariants, resolveFaviconKind } from '@/lib/logo-studio/favicon'
import { buildIco } from '@/lib/logo-studio/ico'
import { brandKitFileNames, brandKitSpec } from '@/lib/logo-studio/brand-kit'
import { buildZip } from '@/lib/logo-studio/zip'
import { AI_EMBLEMS_PER_ROUND, LOGO_EMBLEM_CREDITS, LOGO_STYLE_IDS, STYLE_SPECS } from '@/lib/logo-studio/rules'
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

  it('ships at least 120 local emblems, at least 8 per sector', () => {
    expect(LOCAL_EMBLEM_COUNT).toBeGreaterThanOrEqual(120)
    for (const id of SECTOR_IDS) {
      expect(EMBLEM_LIBRARY.filter((e) => e.sector === id).length).toBeGreaterThanOrEqual(8)
    }
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


describe('logo studio: favicon, styles, kit and credits', () => {
  const colors = resolveColorway('brand', siteColors)
  const text = assetsFor('Acme Kafe')

  it('offers the four styles', () => {
    expect(LOGO_STYLE_IDS).toEqual(['modern', 'classic', 'minimal', 'luxury'])
    for (const id of LOGO_STYLE_IDS) expect(STYLE_SPECS[id].fontFamily).toBeTruthy()
  })

  it('builds square emblem-only favicons at 16/32/48/180/512', () => {
    expect([...FAVICON_PNG_SIZES]).toEqual([16, 32, 48, 180, 512])
    const emblem = localEmblems({ count: 1, palette, brand: 'Acme', context: 'kafe', seed: 0 })[0]
    const variants = buildFaviconVariants({ emblem, text, colors, style: 'modern' })
    expect(variants.map((v) => v.size)).toEqual([16, 32, 48, 180, 512])
    for (const v of variants) {
      expect(v.svg).toContain('viewBox="0 0 100 100"')
      expect(v.svg).toContain(`width="${v.size}" height="${v.size}"`)
    }
  })

  it('falls back to a monogram when the emblem is too detailed for 32 px', () => {
    const busy = {
      ...localEmblems({ count: 1, palette, brand: 'Acme', context: '', seed: 0 })[0],
      simple: undefined,
      inner: Array.from({ length: 30 }, (_, i) => `<path d="M${i} 0 L10 10 C1 2 3 4 5 6 Z"/>`).join(''),
    }
    expect(resolveFaviconKind({ emblem: busy, prefer: 'auto' })).toBe('monogram')
    expect(resolveFaviconKind({ emblem: null })).toBe('monogram')
    const r = buildFaviconSvg({ emblem: busy, text, colors, style: 'modern' }, 32)
    expect(r.kind).toBe('monogram')
  })

  it('writes a valid multi-size .ico and a ZIP', () => {
    const png = new Uint8Array([137, 80, 78, 71])
    const ico = buildIco([16, 32, 48].map((size) => ({ size, png })))
    expect(Array.from(ico.subarray(0, 6))).toEqual([0, 0, 1, 0, 3, 0])
    const zip = buildZip([{ name: 'a.txt', data: new Uint8Array([1, 2, 3]) }])
    expect(Array.from(zip.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('brand kit lists palette hex values, usage rules and the export names', () => {
    const lockup = buildLockup({ layout: 'horizontal', text, emblem: null, colors, style: 'modern' })
    const spec = brandKitSpec({
      layout: 'horizontal',
      colors,
      lockup,
      labels: { primary: 'Ana', accent: 'Vurgu', text: 'Metin' },
    })
    expect(spec.swatches.every((s) => /^#[0-9a-f]{6}$/i.test(s.hex))).toBe(true)
    expect(spec.minSize.px).toBeGreaterThan(0)
    expect(spec.minSize.mm).toBeGreaterThan(0)
    expect(spec.iconMin.px).toBe(16)
    expect(spec.clearSpaceUnits).toBeGreaterThan(0)
    const n = brandKitFileNames('acme')
    expect(n.png2x).toBe('acme-logo@2x.png')
    expect(n.kitZip).toBe('acme-logo-kit.zip')
    expect(n.faviconDir).toBe('favicon/')
  })

  it('charges credits per AI emblem drawn', () => {
    expect(AI_EMBLEMS_PER_ROUND * LOGO_EMBLEM_CREDITS).toBe(4)
  })
})
