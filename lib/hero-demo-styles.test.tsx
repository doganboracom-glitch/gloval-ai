import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { demoImages } from '@/lib/demo-images'
import type { WebsiteSchema } from '@/lib/website-schema'

function heroOf(site: WebsiteSchema) {
  const hero = site.sections.find((s) => s.type === 'hero')
  if (!hero || hero.type !== 'hero') throw new Error('no hero')
  return hero
}

function demo(slug: string) {
  const found = demos.find((d) => d.slug === slug)
  if (!found) throw new Error(`no demo ${slug}`)
  return found
}

describe('demos showcase the three hero styles with their existing photography', () => {
  it('restoran is full-screen, kahve is light side-image, every other demo stays standard', () => {
    expect(heroOf(buildDemoSite(demo('restoran'), 'tr')).layout).toBe('full-bleed')
    expect(heroOf(buildDemoSite(demo('kahve'), 'tr')).layout).toBe('light-cover')
    for (const d of demos) {
      if (d.slug === 'restoran' || d.slug === 'kahve') continue
      const hero = heroOf(buildDemoSite(d, 'tr'))
      expect(hero.layout, d.slug).toBeUndefined()
      expect(hero.align, d.slug).toBeUndefined()
      expect(hero.overlay, d.slug).toBeUndefined()
    }
  })

  it('uses only images that already exist (no new generated assets)', () => {
    expect(heroOf(buildDemoSite(demo('restoran'), 'tr')).image?.src).toBe(demoImages.restoran.hero)
    expect(heroOf(buildDemoSite(demo('kahve'), 'tr')).image?.src).toBe(demoImages.kahve.hero)
  })

  for (const slug of ['restoran', 'kahve']) {
    for (const lang of ['tr', 'en'] as const) {
      it(`${slug} (${lang}) renders its style and every hero href is a real address`, () => {
        const site = buildDemoSite(demo(slug), lang)
        const html = renderToStaticMarkup(<WebsiteRenderer site={site} />)
        const heroHtml = html.slice(html.indexOf('id="hero"'), html.indexOf('</section>', html.indexOf('id="hero"')))
        expect(heroHtml.length).toBeGreaterThan(100)
        if (slug === 'restoran') expect(heroHtml).toMatch(/md:min-h-\[640px\]/)
        else expect(heroHtml).toMatch(/var\(--site-card\)/)
        const hrefs = [...heroHtml.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
        expect(hrefs.length).toBeGreaterThan(0)
        for (const href of hrefs) {
          expect(href).not.toBe('')
          expect(href).not.toBe('#')
          expect(href).not.toMatch(/undefined|null|\[object/)
          expect(href).toMatch(/^(\/|#[\w-]+|https?:|mailto:|tel:)/)
        }
      })
    }
  }
})
