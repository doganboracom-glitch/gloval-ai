import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AboutSection } from '@/components/website-renderer/sections/about-section'
import { LegacyAboutSection } from '@/components/website-renderer/sections/__fixtures__/legacy-about-section'
import { announcementTextColor } from '@/components/website-renderer/sections/announcement-contrast'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import {
  ABOUT_LAYOUTS,
  layoutAvailability,
  normalizeAboutMedia,
  pickAboutLayout,
  resolveAboutMedia,
  seedAboutMedia,
  type AboutLayout,
} from '@/lib/about-media'
import { buildDemoSite, demos } from '@/lib/demos'
import { collectSampleFindings, stripSampleContent } from '@/lib/sample-content'
import { fallbackWebsite, websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'

type About = Extract<Section, { type: 'about' }>
type Lang = 'tr' | 'en'

const IMAGES = [
  { src: '/a.jpg', alt: 'Ofis' },
  { src: '/b.jpg', alt: 'Ekip' },
  { src: '/c.jpg', alt: 'Atolye' },
]

function about(media?: About['media']): About {
  return {
    type: 'about',
    title: 'Hakkimizda',
    body: 'Ekibimiz yillardir ayni titizlikle calisiyor.',
    highlights: ['Hizli teslimat', 'Seffaf fiyat'],
    ...(media ? { media } : {}),
  } as About
}

function mediaFor(layout: AboutLayout): About['media'] {
  return {
    enabled: true,
    layout,
    images: layout === 'collage' ? IMAGES : IMAGES.slice(0, 1),
    label: 'Biz kimiz',
    figure: layout === 'figure' ? { value: '2009', label: 'kurulus yili' } : undefined,
  } as About['media']
}

function themed(mode: 'light' | 'dark', lang: Lang, section: About) {
  const site = fallbackWebsite('test', lang)
  const theme = resolveTheme({ ...site, theme: { ...site.theme, mode } })
  const style = themeToCssVars(theme)
  return renderToStaticMarkup(
    <div style={style}>
      <AboutSection data={section} siteName="Acme" colors={theme} />
    </div>,
  )
}

describe('four layouts render, in both languages and both modes', () => {
  for (const layout of ABOUT_LAYOUTS) {
    for (const lang of ['tr', 'en'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        it(`${layout} / ${lang} / ${mode}`, () => {
          const html = themed(mode, lang, about(mediaFor(layout)))
          expect(html).toContain(`data-about-layout="${layout}"`)
          const imgCount = (html.match(/<img /g) ?? []).length
          expect(imgCount).toBe(layout === 'collage' ? 3 : 1)
          expect(html).toContain('alt="')
          expect(html).not.toMatch(/alt=""/)
          if (layout === 'figure') expect(html).toContain('2009')
        })
      }
    }
  }

  it('stays single-column and unbounded-width-free at 375px (columns only from lg:)', () => {
    for (const layout of ABOUT_LAYOUTS) {
      const html = themed('light', 'tr', about(mediaFor(layout)))
      expect(html).not.toMatch(/(?<![\w-:])grid-cols-\[/)
      expect(html).not.toMatch(/(?<![\w-:])w-\[\d+px\]/)
      expect(html).not.toMatch(/style="[^"]*width:\s*\d{4,}px/)
      expect(html).toContain('lg:grid-cols-')
      expect(html).toContain('w-full')
    }
  })
})

describe('text-weighted fallback', () => {
  it('uses the text layout, with no image frame, when media is switched off', () => {
    const html = themed('light', 'tr', about({ ...mediaFor('corner')!, enabled: false }))
    expect(html).not.toContain('data-about-layout')
    expect(html).not.toContain('<img')
    expect(html).toContain('Hakkimizda')
    expect(html).toContain('Hizli teslimat')
  })

  it('falls back to text when no image can be drawn', () => {
    const resolved = resolveAboutMedia(
      about({ enabled: true, layout: 'round', images: [{ src: '', alt: 'x' }] } as About['media']),
      'alt',
    )
    expect(resolved.layout).toBe('text')
    expect(resolved.images).toHaveLength(0)
  })
})

describe('figure layout needs real data', () => {
  it('is unavailable without an owner-supplied figure', () => {
    expect(layoutAvailability('figure', 1, undefined).available).toBe(false)
    expect(layoutAvailability('figure', 1, { value: ' ', label: 'x' }).available).toBe(false)
    expect(layoutAvailability('figure', 1, { value: '2009', label: 'kurulus' }).available).toBe(true)
  })

  it('renderer degrades a figure layout without a figure to corner', () => {
    const media = { ...mediaFor('figure')!, figure: undefined }
    expect(resolveAboutMedia(about(media), 'alt').layout).toBe('corner')
    expect(themed('light', 'tr', about(media))).toContain('data-about-layout="corner"')
  })

  it('is never picked automatically without a figure, for any sector', () => {
    for (const sector of ['legal', 'restaurant', 'default', 'automotive'] as const) {
      expect(pickAboutLayout(sector as never, 1, undefined)).not.toBe('figure')
    }
  })

  it('seeding never invents a figure from a prompt that states none', () => {
    const site = fallbackWebsite('modern bir kafe sitesi', 'tr')
    const withAbout: WebsiteSchema = {
      ...site,
      sections: [...site.sections.filter((s) => s.type !== 'about'), about()],
    }
    const seeded = seedAboutMedia(withAbout, 'modern bir kafe sitesi')
    for (const s of seeded.sections) {
      if (s.type === 'about') expect(s.media?.figure).toBeUndefined()
    }
  })
})

describe('old schema stays valid and unchanged', () => {
  it('parses an about section without media', () => {
    const site = fallbackWebsite('test', 'tr')
    const legacy = { ...site, sections: [...site.sections.filter((s) => s.type !== 'about'), about()] }
    const parsed = websiteSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const stored = parsed.data.sections.find((s) => s.type === 'about') as About
      expect(stored.media).toBeUndefined()
    }
  })

  it('normalizeAboutMedia returns legacy sites untouched (same object)', () => {
    const site = fallbackWebsite('test', 'tr')
    const legacy = { ...site, sections: [...site.sections.filter((s) => s.type !== 'about'), about()] }
    expect(normalizeAboutMedia(legacy)).toBe(legacy)
  })
})

describe('published sites keep byte-identical HTML', () => {
  const render = (node: React.ReactNode) => renderToStaticMarkup(<div>{node}</div>)

  it('legacy about (no media) renders exactly as before', () => {
    const data = about()
    expect(render(<AboutSection data={data} siteName="Acme" />)).toBe(
      render(<LegacyAboutSection data={data} />),
    )
  })

  it('legacy about without highlights renders exactly as before', () => {
    const data = { ...about(), highlights: undefined } as About
    expect(render(<AboutSection data={data} siteName="Acme" />)).toBe(
      render(<LegacyAboutSection data={data} />),
    )
  })

  it('media switched off renders exactly as before', () => {
    const data = about({ ...mediaFor('collage')!, enabled: false })
    expect(render(<AboutSection data={data} siteName="Acme" />)).toBe(
      render(<LegacyAboutSection data={data} />),
    )
  })
})

describe('colours come from theme tokens and reach AA', () => {
  it('uses only --site-* variables, never literal colours, in every layout', () => {
    for (const layout of ABOUT_LAYOUTS) {
      const html = renderToStaticMarkup(<AboutSection data={about(mediaFor(layout))} siteName="Acme" />)
      expect(html).toContain('var(--site-')
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(html).not.toMatch(/rgba?\(/)
      expect(html).not.toMatch(/hsla?\(/)
    }
  })

  function rgb(value: string): [number, number, number, number] {
    const v = value.trim()
    if (v.startsWith('#')) {
      const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join('') : v.slice(1)
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
    }
    const n = v.match(/[\d.]+/g)!.map(Number)
    return [n[0], n[1], n[2], n[3] ?? 1]
  }
  function lum([r, g, b]: number[]) {
    const [R, G, B] = [r, g, b].map((c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * R + 0.7152 * G + 0.0722 * B
  }
  function ratio(fg: string, bg: string) {
    const b = rgb(bg)
    const f = rgb(fg)
    const flat = [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]))
    const [l1, l2] = [lum(flat), lum(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  it('text pairs used by the about section reach 4.5:1 for all 8 demos, both languages and modes', () => {
    expect(demos).toHaveLength(8)
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        for (const mode of ['light', 'dark'] as const) {
          const site = buildDemoSite(demo, lang)
          const vars = themeToCssVars(resolveTheme({ ...site, theme: { ...site.theme, mode } })) as Record<
            string,
            string
          >
          const tag = `${demo.slug}/${lang}/${mode}`
          expect(ratio(announcementTextColor(vars['--site-primary']), vars['--site-primary']), `${tag} label/figure chip`).toBeGreaterThanOrEqual(4.5)
          expect(ratio(vars['--site-fg'], vars['--site-bg']), `${tag} heading`).toBeGreaterThanOrEqual(4.5)
          expect(ratio(vars['--site-fg'], vars['--site-card']), `${tag} highlight`).toBeGreaterThanOrEqual(4.5)
          expect(ratio(vars['--site-muted-fg'], vars['--site-bg']), `${tag} body`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})

describe('demos', () => {
  it('every demo about section resolves to a drawable layout or the text fallback', () => {
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        const site = buildDemoSite(demo, lang)
        const section = site.sections.find((s) => s.type === 'about') as About | undefined
        expect(section, demo.slug).toBeDefined()
        const resolved = resolveAboutMedia(section!, 'alt')
        expect(['text', ...ABOUT_LAYOUTS]).toContain(resolved.layout)
        if (resolved.layout === 'figure') expect(resolved.figure).toBeDefined()
      }
    }
  })

  it('a demo figure is flagged as a sample, so the publish gate sees it and stripping removes it', () => {
    let flagged = 0
    for (const demo of demos) {
      const site = buildDemoSite(demo, 'tr')
      const section = site.sections.find((s) => s.type === 'about') as About | undefined
      if (!section?.media?.figure) continue
      flagged++
      expect(section.media.figure.sample, demo.slug).toBe(true)
      const findings = collectSampleFindings(site)
      expect(findings.some((f) => f.sectionType === 'about'), demo.slug).toBe(true)
      const stripped = stripSampleContent(site)
      const after = stripped.sections.find((s) => s.type === 'about') as About
      expect(after.media?.figure).toBeUndefined()
      expect(resolveAboutMedia(after, 'alt').layout).not.toBe('figure')
    }
    expect(flagged).toBeGreaterThan(0)
  })
})
