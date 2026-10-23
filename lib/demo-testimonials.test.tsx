import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { demoTestimonialItems } from '@/lib/demo-testimonials'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'
import { stripSampleContent } from '@/lib/sample-content'
import { SEED_TESTIMONIAL_COUNT, seedTestimonialItems } from '@/lib/testimonials'

const BEFORE_DIR = join(__dirname, '__fixtures__', 'demos-before')
const UNVERIFIABLE_CLAIM = /\d|%|ödül|yıldır|yıllık|birinci|en iyi/i
const REAL_BRANDS = /google|trendyol|hepsiburada|starbucks|instagram|yandex|apple|amazon|nike|zara|migros|booking/i

const render = (site: WebsiteSchema, initialPage: string | null = null) =>
  renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={initialPage} />)

const renderDemo = (site: WebsiteSchema, slug: string, initialPage: string | null = null) =>
  renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      initialPage={initialPage}
      demoRoutes={{
        home: `/demo/${slug}?lang=tr`,
        about: `/demo/${slug}/hakkimizda?lang=tr`,
        aboutPageSlug: null,
        testimonials: { slug: 'musteri-yorumlari', list: `/demo/${slug}/musteri-yorumlari?lang=tr` },
      }}
    />,
  )

describe.each(demos.map((d) => d.slug))('demo %s reviews', (slug) => {
  const demo = demos.find((d) => d.slug === slug)!
  const items = demoTestimonialItems(slug)

  it('has six sample reviews with initial-surname names and no photos', () => {
    expect(items).toHaveLength(6)
    for (const item of items) {
      expect(item.sample).toBe(true)
      expect(item.author).toMatch(/^\p{L}+ \p{Lu}\.$/u)
      expect(item.role?.trim().length).toBeGreaterThan(0)
      expect(item.quote.length).toBeLessThanOrEqual(280)
      expect(Object.keys(item)).not.toContain('image')
    }
    expect(new Set(items.map((i) => i.quote)).size).toBe(6)
  })

  it('makes no unverifiable claim and names no real brand', () => {
    for (const item of items) {
      const text = `${item.quote} ${item.author} ${item.role ?? ''}`
      expect(text).not.toMatch(UNVERIFIABLE_CLAIM)
      expect(text).not.toMatch(REAL_BRANDS)
    }
  })

  it('shows the example tag on every review card on the home page and the reviews page', () => {
    const site = buildDemoSite(demo, 'tr')
    const home = renderDemo(site, slug)
    const page = renderDemo(site, slug, 'musteri-yorumlari')
    for (const html of [home, page]) {
      expect(html.match(/Örnek yorum/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    }
    expect(page.match(/Örnek yorum/g)?.length).toBe(6)
    for (const item of items.slice(0, 3)) expect(home).toContain(item.quote.replace(/'/g, '&#x27;'))
  })

  it('keeps every reviews link inside the demo', () => {
    const site = buildDemoSite(demo, 'tr')
    const own = `/demo/${slug}/musteri-yorumlari`
    const menu = site.navigation.links.filter((l) => l.href.includes('musteri-yorumlari'))
    expect(menu).toHaveLength(1)
    expect(menu[0].href.startsWith(own)).toBe(true)
    const hrefs = [...renderDemo(site, slug).matchAll(/href="([^"]*musteri-yorumlari[^"]*)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThanOrEqual(2)
    for (const href of hrefs) expect(href.startsWith(own)).toBe(true)
  })

  it('leaves the rest of the demo home page HTML unchanged', () => {
    const file = join(BEFORE_DIR, `${slug}.html`)
    expect(existsSync(file)).toBe(true)
    const site = buildDemoSite(demo, 'tr')
    const stripped: WebsiteSchema = {
      ...site,
      sections: site.sections
        .filter((s) => s.type !== 'testimonials')
        .map((s) => {
          if (s.type !== 'hero') return s
          // Hero style fields belong to the hero layout feature; the rest of the page must stay identical.
          const { layout: _layout, align: _align, overlay: _overlay, imageFit: _imageFit, ...plain } = s as Record<string, unknown>
          return plain as typeof s
        }),
      pages: (site.pages ?? []).filter((p) => p.slug !== 'musteri-yorumlari'),
      navigation: {
        ...site.navigation,
        links: site.navigation.links.filter((l) => !l.href.includes('musteri-yorumlari')),
      },
    }
    expect(render(stripped)).toBe(readFileSync(file, 'utf8'))
  })

  it('gives the English demo six labelled example reviews and a menu link inside the demo', () => {
    const site = buildDemoSite(demo, 'en')
    const section = site.sections.find((s) => s.type === 'testimonials')
    expect(section && section.type === 'testimonials' && section.items.length).toBe(6)
    expect(section && section.type === 'testimonials' && section.items.every((i) => i.sample)).toBe(true)
    const menu = site.navigation.links.filter((l) => l.href.includes('musteri-yorumlari'))
    expect(menu.map((l) => l.href)).toEqual([`/demo/${slug}/musteri-yorumlari?lang=en`])
  })
})

describe('generated site placeholders', () => {
  const demoQuotes = new Set(demos.flatMap((d) => demoTestimonialItems(d.slug).map((i) => i.quote)))

  it.each([
    ['generic', undefined],
    ['clinic', fallbackWebsite('Kadıköy\'de bir diş kliniği için site', 'tr')],
    ['restaurant', fallbackWebsite('Bir restoran için site', 'tr')],
  ] as const)('seeds six generic sample placeholders (%s)', (_name, site) => {
    const items = seedTestimonialItems('tr', site)
    expect(items).toHaveLength(SEED_TESTIMONIAL_COUNT)
    for (const item of items) {
      expect(item.sample).toBe(true)
      expect(item.quote).toMatch(/^Müşteri yorumunuzu buraya yazın\./)
      expect(demoQuotes.has(item.quote)).toBe(false)
      expect(`${item.quote} ${item.author}`).not.toMatch(UNVERIFIABLE_CLAIM)
    }
  })

  it('never copies a demo review text into a placeholder', () => {
    const demoText = demos.flatMap((d) => demoTestimonialItems(d.slug).map((i) => i.quote)).join(' ')
    for (const item of seedTestimonialItems('tr')) {
      for (const sentence of item.quote.split('. ')) expect(demoText).not.toContain(sentence)
    }
  })

  it('hides the placeholders on the public site', () => {
    const site = fallbackWebsite('Bir dental klinik için site', 'tr')
    const items = seedTestimonialItems('tr', site)
    const withSection: WebsiteSchema = {
      ...site,
      sections: [
        ...site.sections.filter((s) => s.type !== 'testimonials'),
        { type: 'testimonials', title: 'Yorumlar', items, pageEnabled: true, linkEnabled: true },
      ],
    }
    expect(renderToStaticMarkup(<WebsiteRenderer site={withSection} pageRouting initialPage={null} />)).toContain(
      'Müşteri yorumunuzu buraya yazın',
    )
    const html = render(stripSampleContent(withSection))
    expect(html).not.toContain('Müşteri yorumunuzu buraya yazın')
    expect(html).not.toContain('Müşteri adı')
    expect(html).not.toContain('Örnek yorum')
  })
})
