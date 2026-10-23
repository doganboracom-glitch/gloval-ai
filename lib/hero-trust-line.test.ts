import { describe, expect, it } from 'vitest'
import { buildSiteGenerateSystem } from '@/lib/site-generate-prompt'
import { sanitizeGeneratedProofContent } from '@/lib/proof-content'
import { buildDemoSite, demos } from '@/lib/demos'
import { fallbackWebsite } from '@/lib/website-schema'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'
import type { WebsiteSchema } from '@/lib/website-schema'

/** Digits, percentages, counts, years and awards: anything that reads as an invented figure. */
const NUMERIC_TRUST = /\d|%|yüzde|percent|ödül|odul|award|sertifika|certif|müşteri|musteri|customers?|clients?|\+/iu

function trustOf(site: WebsiteSchema): string | undefined {
  const hero = site.sections.find((s) => s.type === 'hero')
  return hero && hero.type === 'hero' ? hero.trustText : undefined
}

describe('the hero trust line is never auto-generated with figures', () => {
  it('the generation prompt no longer asks for a hero trustText and forbids figures', () => {
    const system = buildSiteGenerateSystem('tr' as never, undefined as never, undefined as never)
    expect(system).not.toMatch(/Give the hero a badge and a trustText/)
    expect(system).toMatch(/Leave the hero trustText unset/)
    expect(system).toMatch(/never contain numbers, percentages, counts or awards/)
  })

  it('a model-written "N+ projede güvenilen ekip" line is removed by the pipeline', () => {
    for (const trustText of ['150+ projede güvenilen ekip', '%98 müşteri memnuniyeti', '12 yıllık tecrübe', 'Award-winning team', '5 ödül']) {
      const site = buildSampleSite()
      const hero = site.sections.find((s) => s.type === 'hero')
      if (!hero || hero.type !== 'hero') throw new Error('no hero')
      hero.trustText = trustText
      delete hero.sample
      const out = sanitizeGeneratedProofContent(site)
      expect(trustOf(out), trustText).toBeUndefined()
    }
  })

  it('neutral, figure-free lines the owner wrote are kept', () => {
    const site = buildSampleSite()
    const hero = site.sections.find((s) => s.type === 'hero')
    if (!hero || hero.type !== 'hero') throw new Error('no hero')
    hero.trustText = 'Randevu alın'
    delete hero.sample
    expect(trustOf(sanitizeGeneratedProofContent(site))).toBe('Randevu alın')
  })

  it('no built-in generator (fallback sites in both languages, every demo) emits a numeric trust line', () => {
    const sites: WebsiteSchema[] = []
    for (const lang of ['tr', 'en'] as const) {
      sites.push(fallbackWebsite('modern web sitesi', lang === 'tr' ? 'tr' : 'en'))
      for (const demo of demos) sites.push(buildDemoSite(demo, lang))
    }
    for (const site of sites) {
      const trust = trustOf(site)
      if (trust) expect(trust).not.toMatch(NUMERIC_TRUST)
    }
  })

  it('the field is optional in the schema and an empty one renders nothing', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { HeroSection } = await import('@/components/website-renderer/sections/hero-section')
    const base = { type: 'hero' as const, title: 'Başlık', description: 'Açıklama' }
    for (const trustText of [undefined, '']) {
      for (const layout of [undefined, 'full-bleed', 'light-cover', 'split'] as const) {
        const html = renderToStaticMarkup(createElement(HeroSection, { data: { ...base, trustText, layout } }))
        expect(html).not.toMatch(/<p[^>]*text-xs[^>]*><\/p>/)
        expect(html).toContain('Başlık')
      }
    }
  })
})
