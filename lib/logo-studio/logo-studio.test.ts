import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { buildTextAssets, bundledFont, initialsOf, loadHeadingFont } from '@/lib/logo-studio/font-source'
import { textToPath } from '@/lib/logo-studio/ttf'
import {
  applyMetallicFinish,
  buildLockup,
  LEGACY_LOGO_LAYOUTS,
  LOGO_LAYOUTS_V2,
  svgToDataUri,
  type EmblemAsset,
  type TextAssets,
} from '@/lib/logo-studio/compose'
import { EMBLEM_LIBRARY, LOCAL_EMBLEM_COUNT, SECTOR_IDS, localEmblems, pickLocalEmblems } from '@/lib/logo-studio/emblem-local'
import { FAVICON_PNG_SIZES, buildFaviconSvg, buildFaviconVariants, resolveFaviconKind } from '@/lib/logo-studio/favicon'
import { buildIco } from '@/lib/logo-studio/ico'
import { brandKitFileNames, brandKitSpec, brandKitVectorFiles } from '@/lib/logo-studio/brand-kit'
import { buildZip } from '@/lib/logo-studio/zip'
import {
  AI_EMBLEMS_PER_ROUND,
  LOGO_EMBLEM_CREDITS,
  LOGO_STYLE_IDS,
  METALLIC_TOKEN_COLORS,
  STYLE_SPECS,
} from '@/lib/logo-studio/rules'
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

function metallicFixture(tone: 'gold' | 'silver' | 'bronze' = 'gold'): EmblemAsset {
  return applyMetallicFinish(
    {
      id: 'metal-fixture',
      source: 'ai',
      inner: `<g fill="${METALLIC_TOKEN_COLORS.mid}"><path d="M100 28L165 140H35Z" fill="${METALLIC_TOKEN_COLORS.light}"/><circle cx="100" cy="100" r="24" fill="${METALLIC_TOKEN_COLORS.dark}"/></g>`,
      viewBox: { w: 200, h: 200 },
      bbox: { x: 35, y: 28, w: 130, h: 112 },
    },
    tone,
  )
}

describe('logo studio', () => {
  it('keeps the V1 horizontal SVG byte-for-byte stable without a V2 sector label', () => {
    const name = 'Acme Studio'
    const text = assetsFor(name)
    const emblem: EmblemAsset = {
      id: 'legacy-fixture',
      source: 'ai',
      inner: '<g fill="#6d28d9"><path d="M20 80L50 20L80 80Z"/><circle cx="50" cy="58" r="12" fill="#06b6d4"/></g>',
      viewBox: { w: 200, h: 200 },
      bbox: { x: 20, y: 20, w: 60, h: 60 },
    }
    const svg = buildLockup({
      layout: 'horizontal',
      emblem,
      text,
      colors: resolveColorway('brand', siteColors),
      style: 'modern',
    }).svg
    expect(createHash('sha256').update(svg).digest('hex')).toBe(
      '7eb2c9c07c7a7cb46185bf37c53afc3ccad7c36f7a8ac71cccc9d66c3d3407af',
    )
  })

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

  it('keeps V1 layouts and composes metallic stacked/badge lockups with sector paths', () => {
    expect(LEGACY_LOGO_LAYOUTS).toEqual(['horizontal', 'vertical', 'wordmark'])
    expect(LOGO_LAYOUTS_V2).toEqual(['horizontal', 'vertical', 'wordmark', 'stacked', 'badge'])

    const text = assetsFor('LUNA')
    const sectorLabel = textToPath(bundledFont(), 'MÜCEVHER', { size: 100, letterSpacing: 0.14 })
    for (const layout of ['horizontal', 'stacked', 'badge'] as const) {
      const lockup = buildLockup({
        layout,
        emblem: metallicFixture('silver'),
        text,
        sectorLabel,
        colors: resolveColorway('brand', siteColors),
        style: 'luxury',
      })
      expect(lockup.svg).toContain('<linearGradient')
      expect(lockup.svg).toContain('<feGaussianBlur')
      expect(lockup.svg).toContain('stroke="url(#logo-metal-')
      expect(lockup.svg).not.toContain('<text')
      expect(svgToDataUri(lockup.svg)).toContain('linearGradient')
      expect(lockup.width).toBeGreaterThan(0)
      expect(lockup.height).toBeGreaterThan(0)
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

  it('offers five distinct motif families per sector and honors explicit sector selection', () => {
    for (const sectorId of SECTOR_IDS) {
      const motifs = new Set(
        EMBLEM_LIBRARY.filter((emblem) => emblem.sector === sectorId).map((emblem) => emblem.glyph),
      )
      expect(motifs.size).toBeGreaterThanOrEqual(5)
      const picks = pickLocalEmblems({ count: 4, brand: 'LUNA', context: 'law restaurant', seed: 0, sectorId })
      expect(picks.every((pick) => EMBLEM_LIBRARY.find((emblem) => emblem.id === pick.entry)?.sector === sectorId)).toBe(true)
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

  it('keeps metallic gradients for AI marks and a flat simple mark for favicons', () => {
    const ai = buildFaviconSvg({ emblem: metallicFixture('silver'), text, colors, style: 'luxury', prefer: 'emblem' }, 32)
    expect(ai.kind).toBe('emblem')
    expect(ai.svg).toContain('<defs>')
    expect(ai.svg).toContain('<linearGradient')

    const local = applyMetallicFinish({
      id: 'simple-favicon',
      source: 'local',
      inner: `<path d="M10 50H90L50 10Z" fill="${METALLIC_TOKEN_COLORS.mid}"/>`,
      simple: `<path d="M10 50H90L50 10Z" fill="${METALLIC_TOKEN_COLORS.mid}"/>`,
      viewBox: { w: 100, h: 100 },
    }, 'silver')
    const simple = buildFaviconSvg({ emblem: local, text, colors, style: 'modern', prefer: 'emblem' }, 32)
    expect(simple.kind).toBe('emblem')
    expect(simple.svg).not.toContain('<defs>')
    expect(simple.svg).not.toContain('<linearGradient')
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

  it('keeps metallic gradients in the SVG assets added to a brand-kit bundle', () => {
    const lockup = buildLockup({
      layout: 'badge',
      text: assetsFor('LUNA'),
      sectorLabel: textToPath(bundledFont(), 'MÜCEVHER', { size: 100, letterSpacing: 0.14 }),
      emblem: metallicFixture('gold'),
      colors,
      style: 'luxury',
    })
    const files = brandKitVectorFiles({ slug: 'luna', light: lockup, dark: lockup, iconSvg: lockup.svg })
    const decoded = files.map((file) => new TextDecoder().decode(file.data))
    expect(files.map((file) => file.name)).toEqual(['luna-logo.svg', 'luna-logo-dark.svg', 'luna-logo-icon.svg'])
    expect(decoded.every((svg) => svg.includes('<linearGradient'))).toBe(true)
  })

  it('charges credits per AI emblem drawn', () => {
    expect(AI_EMBLEMS_PER_ROUND * LOGO_EMBLEM_CREDITS).toBe(8)
  })
})
