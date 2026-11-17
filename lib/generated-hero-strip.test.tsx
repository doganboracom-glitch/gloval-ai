import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'
import {
  GENERATED_HERO_STRIP_FALLBACK,
  ensureGeneratedHeroStrip,
} from '@/lib/generated-hero-strip'
import { isUnverifiableHeroStripClaim } from '@/lib/hero-strip'
import { HERO_STRIP_TEXT_MAX, HERO_STRIP_TITLE_MAX } from '@/lib/list-limits'
import { stripSampleContent } from '@/lib/sample-content'
import { fallbackWebsite, websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'

type StripSection = Extract<Section, { type: 'heroStrip' }>

const strips = (site: WebsiteSchema) => site.sections.filter((s): s is StripSection => s.type === 'heroStrip')

describe('ensureGeneratedHeroStrip', () => {
  it('adds one floating, four-box, visible strip directly under the hero', () => {
    const site = fallbackWebsite('inşaat firması', 'tr')
    const out = ensureGeneratedHeroStrip(site, 'tr')
    const [strip] = strips(out)
    expect(strips(out)).toHaveLength(1)
    expect(strip.variant).toBe('floating')
    expect(strip.sample).toBeUndefined()
    expect(strip.items).toHaveLength(4)
    const heroIndex = out.sections.findIndex((s) => s.type === 'hero' || s.type === 'slider')
    expect(out.sections[heroIndex + 1]).toBe(strip)
    expect(websiteSchema.safeParse(out).success).toBe(true)
    expect(site.sections.some((s) => s.type === 'heroStrip')).toBe(false)
  })

  it('survives publishing (not stripped as sample) and renders the floating grid', () => {
    const out = ensureGeneratedHeroStrip(buildSampleSite(), 'tr')
    const published = stripSampleContent(out)
    expect(strips(published)).toHaveLength(1)
    const html = renderToStaticMarkup(<WebsiteRenderer site={published} />)
    expect(html).toContain('data-hero-strip')
    expect(html).toContain('Hızlı Dönüş')
  })

  it('fallback boxes are number-free, claim-free and within the limits in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      const boxes = GENERATED_HERO_STRIP_FALLBACK[lang]
      expect(boxes).toHaveLength(4)
      for (const [, title, text] of boxes) {
        expect(`${title} ${text}`).not.toMatch(/\d|%/)
        expect(isUnverifiableHeroStripClaim(`${title} ${text}`)).toBe(false)
        expect(title.length).toBeLessThanOrEqual(HERO_STRIP_TITLE_MAX)
        expect(text.length).toBeLessThanOrEqual(HERO_STRIP_TEXT_MAX)
      }
    }
    const en = ensureGeneratedHeroStrip(buildSampleSite(), 'en')
    expect(strips(en)[0].items[0].title).toBe('Quick Response')
  })

  it('keeps a model-written strip, forces the floating layout and replaces claim boxes', () => {
    const site = buildSampleSite()
    site.sections.splice(1, 0, {
      type: 'heroStrip',
      sample: true,
      items: [
        { icon: 'truck', title: 'Aynı Gün Teslim', text: 'Siparişiniz özenle gelir' },
        { icon: 'star', title: '17 Yıllık Tecrübe', text: 'Sektörde lider' },
      ],
    } as Section)
    const out = ensureGeneratedHeroStrip(site, 'tr')
    const [strip] = strips(out)
    expect(strips(out)).toHaveLength(1)
    expect(strip.variant).toBe('floating')
    expect(strip.sample).toBeUndefined()
    expect(strip.items).toHaveLength(4)
    expect(strip.items[0].title).toBe('Aynı Gün Teslim')
    expect(strip.items.map((i) => i.title).join(' ')).not.toContain('17')
  })

  it('does not duplicate when run twice', () => {
    const once = ensureGeneratedHeroStrip(buildSampleSite(), 'tr')
    const twice = ensureGeneratedHeroStrip(once, 'tr')
    expect(strips(twice)).toHaveLength(1)
    expect(twice.sections.map((s) => s.type)).toEqual(once.sections.map((s) => s.type))
  })
})
