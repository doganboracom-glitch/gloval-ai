import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroStripSection } from '@/components/website-renderer/sections/hero-strip-section'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { HeroStripIconPicker } from '@/components/editor/hero-strip-fields'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'
import { DEMO_HERO_STRIP_BOXES, demoHeroStripItems } from '@/lib/demo-hero-strip'
import { buildDemoSite, demos } from '@/lib/demos'
import { guardEdit } from '@/lib/edit-guard'
import {
  HERO_STRIP_ICONS,
  HERO_STRIP_DEFAULT_ICON,
  filterHeroStripIcons,
  isUnverifiableHeroStripClaim,
  resolveHeroStripIcon,
} from '@/lib/hero-strip'
import { HERO_STRIP_TEXT_MAX, HERO_STRIP_TITLE_MAX } from '@/lib/list-limits'
import { stripSampleContent } from '@/lib/sample-content'
import { parseCommand } from '@/lib/website-command-parser'
import { applyOperation } from '@/lib/website-edit-operations'
import { websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'

type StripSection = Extract<Section, { type: 'heroStrip' }>

const realStrip = (): StripSection => ({
  type: 'heroStrip',
  items: [
    { icon: 'truck', title: 'Hızlı teslimat', text: 'Siparişiniz özenle gelir' },
    { icon: 'lock', title: 'Güvenli ödeme', text: 'Bilgileriniz korunur' },
    { icon: 'headphones', title: 'Destek', text: 'Sorularınız için buradayız' },
    { icon: 'refresh-cw', title: 'Kolay iade', text: 'Koşullar sayfada' },
  ],
})

const html = (site: WebsiteSchema) => renderToStaticMarkup(<WebsiteRenderer site={site} />)

describe('(a) appearance of the strip', () => {
  const out = renderToStaticMarkup(<HeroStripSection data={realStrip()} />)

  it('is a list with one li per box, a 4-column desktop / 2x2 tablet / stacked mobile grid and 1px hairlines', () => {
    expect(out.match(/<ul/g)).toHaveLength(1)
    expect(out.match(/<li/g)).toHaveLength(4)
    expect(out).toContain('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')
    expect(out).toContain('gap-px')
  })

  it('puts the icon on the left (aria-hidden), a bold title and a small muted text', () => {
    expect(out.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4)
    expect(out).toContain('font-bold')
    expect(out).toContain('text-xs')
    expect(out).toContain('var(--site-muted-fg)')
  })

  it('colours only through the site theme tokens', () => {
    expect(out).toContain('var(--site-card)')
    expect(out).toContain('var(--site-fg)')
    expect(out).toContain('var(--site-border)')
    expect(out).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })

  it('has no headings, links, buttons or hover styles', () => {
    expect(out).not.toMatch(/<h[1-6]/)
    expect(out).not.toMatch(/<a[\s>]/)
    expect(out).not.toMatch(/<button/)
    expect(out).not.toContain('hover:')
  })

  it('is its own row, so it never overlaps a hero style', () => {
    for (const layout of [undefined, 'split', 'light-cover', 'full-bleed'] as const) {
      const site = buildSampleSite()
      const hero = site.sections.find((s) => s.type === 'hero')
      if (hero?.type === 'hero' && layout) hero.layout = layout as never
      site.sections.splice(1, 0, realStrip())
      const page = html(site)
      const heroEnd = page.indexOf('</section>', page.indexOf('id="hero"'))
      expect(page.indexOf('data-hero-strip')).toBeGreaterThan(heroEnd)
    }
  })
})

describe('(b) placement through "Bölüm ekle"', () => {
  const add = (site: WebsiteSchema) => applyOperation(site, { op: 'addSection', sectionType: 'heroStrip' })

  it('goes right under the hero when the hero is the first section', () => {
    const site = buildSampleSite()
    expect(site.sections[0].type).toBe('hero')
    expect(add(site).sections.map((s) => s.type).slice(0, 3)).toEqual(['hero', 'heroStrip', site.sections[1].type])
  })

  it('goes to the very top when the hero is not first', () => {
    const site = buildSampleSite()
    site.sections.unshift({ type: 'announcement', items: [{ text: 'Duyuru' }] } as Section)
    expect(add(site).sections[0].type).toBe('heroStrip')
  })
})

describe('(c) icon picker', () => {
  it('has a lucide set of about 36 icons, all with labels', () => {
    expect(HERO_STRIP_ICONS.length).toBeGreaterThanOrEqual(32)
    expect(HERO_STRIP_ICONS.length).toBeLessThanOrEqual(40)
  })

  it('searches by key, Turkish and English label', () => {
    expect(filterHeroStripIcons('teslimat')).toContain('truck')
    expect(filterHeroStripIcons('refresh')).toContain('refresh-cw')
    expect(filterHeroStripIcons('zzzz')).toEqual([])
    expect(filterHeroStripIcons('')).toHaveLength(HERO_STRIP_ICONS.length)
  })

  it('falls back to the default icon for an unknown key', () => {
    expect(resolveHeroStripIcon('not-an-icon')).toBe(HERO_STRIP_DEFAULT_ICON)
    expect(resolveHeroStripIcon(undefined)).toBe(HERO_STRIP_DEFAULT_ICON)
    const out = renderToStaticMarkup(<HeroStripSection data={{ ...realStrip(), items: realStrip().items.map((i) => ({ ...i, icon: 'bogus' })) }} />)
    expect(out).toContain('<svg')
  })

  it('renders a search box and a grid of pressable buttons, not a select', () => {
    const out = renderToStaticMarkup(<HeroStripIconPicker value="truck" lang="tr" onChange={() => {}} />)
    expect(out).toContain('type="search"')
    expect(out).not.toContain('<select')
    expect(out.match(/<button/g)).toHaveLength(HERO_STRIP_ICONS.length)
    expect(out).toContain('aria-pressed="true"')
  })
})

describe('(d) demos', () => {
  const CLAIM = /\d|%|yıllık|lider|en iyi|resmi yetkili|leading|best|official|authori[sz]ed|years/i

  it('all 8 demos have four sector-fitting, number-free, claim-free boxes in both languages', () => {
    expect(demos).toHaveLength(8)
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        const boxes = DEMO_HERO_STRIP_BOXES[demo.slug][lang]
        expect(boxes, `${demo.slug} ${lang}`).toHaveLength(4)
        for (const [icon, title, text] of boxes) {
          expect(HERO_STRIP_ICONS).toContain(icon)
          expect(title.length).toBeLessThanOrEqual(HERO_STRIP_TITLE_MAX)
          expect(text.length).toBeLessThanOrEqual(HERO_STRIP_TEXT_MAX)
          expect(`${title} ${text}`).not.toMatch(CLAIM)
          expect(isUnverifiableHeroStripClaim(`${title} ${text}`)).toBe(false)
        }
      }
    }
  })

  it('every demo site carries one sample-flagged strip under its hero, and still parses', () => {
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        const site = buildDemoSite(demo, lang)
        const strips = site.sections.filter((s): s is StripSection => s.type === 'heroStrip')
        expect(strips, demo.slug).toHaveLength(1)
        expect(strips[0].sample).toBe(true)
        expect(strips[0].items.every((i) => i.sample === true)).toBe(true)
        const heroIdx = site.sections.findIndex((s) => s.type === 'hero')
        const stripIdx = site.sections.indexOf(strips[0])
        expect(stripIdx).toBeGreaterThan(heroIdx)
        expect(site.sections.slice(heroIdx + 1, stripIdx).every((s) => s.type === 'slider')).toBe(true)
        expect(websiteSchema.safeParse(site).success, demo.slug).toBe(true)
        expect(demoHeroStripItems(demo.slug, lang)).toHaveLength(4)
      }
    }
  })

  it('the demo HTML differs from the strip-less demo only by the strip fragment', () => {
    for (const demo of demos) {
      const site = buildDemoSite(demo, 'tr')
      const bare = structuredClone(site)
      bare.sections = bare.sections.filter((s) => s.type !== 'heroStrip')
      const withStrip = html(site)
      const fragment = withStrip.match(/<section id="hero-strip"[\s\S]*?<\/section>/)?.[0]
      expect(fragment, demo.slug).toBeDefined()
      expect(withStrip.replace(fragment as string, '')).toBe(html(bare))
    }
  })
})

describe('(e) the AI pipeline does not produce the strip', () => {
  it('fallback generation has no strip', () => {
    for (const prompt of ['kahve dükkanı', 'diş kliniği', 'online mağaza']) {
      const site = buildDemoSite({ ...demos[0], slug: 'none', prompt: { tr: prompt, en: prompt } } as never, 'tr')
      expect(site.sections.some((s) => s.type === 'heroStrip')).toBe(false)
    }
  })

  it('"slider altına 4 kutu ekle" adds a strip whose boxes are sample placeholders without numbers or claims', () => {
    const site = buildSampleSite()
    const parsed = parseCommand('slider altına 4 kutu ekle', site)
    expect(parsed?.operations).toEqual([{ op: 'addSection', sectionType: 'heroStrip' }])
    const next = applyOperation(site, parsed!.operations[0])
    const strip = next.sections.find((s): s is StripSection => s.type === 'heroStrip')!
    expect(strip.items).toHaveLength(4)
    for (const item of strip.items) {
      expect(item.sample).toBe(true)
      expect(`${item.title} ${item.text}`).not.toMatch(/\d|%/)
      expect(isUnverifiableHeroStripClaim(`${item.title} ${item.text}`)).toBe(false)
    }
    expect(guardEdit(site, next).ok).toBe(true)
  })

  it('unconfirmed sample boxes never reach a published page', () => {
    const site = buildSampleSite()
    site.sections.splice(1, 0, { type: 'heroStrip', sample: true, items: demoHeroStripItems('kahve', 'tr')! } as Section)
    const published = stripSampleContent(site)
    expect(published.sections.some((s) => s.type === 'heroStrip')).toBe(false)
    expect(html(published)).not.toContain('data-hero-strip')
  })
})

describe('(f) published sites are unchanged', () => {
  it('a site without a strip renders no strip markup', () => {
    const site = buildSampleSite()
    expect(html(site)).not.toContain('data-hero-strip')
  })

  it('the stored schemas of the live sites contain no strip, so their golden snapshots still apply', () => {
    for (const slug of ['dbajans', 'mimarlik-studyosu', 'luna-mucevher']) {
      const raw = readFileSync(new URL(`./__fixtures__/published-${slug}.json`, import.meta.url), 'utf8')
      expect(raw).not.toContain('heroStrip')
    }
  })
})
