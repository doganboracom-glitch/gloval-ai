import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { resolveAboutDetail } from '@/lib/section-detail'
import { resolveServices } from '@/lib/service-pages'

const hrefsOf = (html: string) =>
  Array.from(html.matchAll(/<a\s[^>]*?href="([^"]*)"/g), (m) => m[1].replace(/&amp;/g, '&'))

const PLACEHOLDER = /lorem|ipsum|dolor sit|placeholder|yer tutucu|örnek metin|sample text|buraya yaz|your text here/i

function render(slug: string, lang: 'tr' | 'en', service: string | null | 'list') {
  const demo = demos.find((d) => d.slug === slug)!
  const site = buildDemoSite(demo, lang)
  const resolved = resolveServices(site)!
  const q = lang === 'en' ? '?lang=en' : ''
  const html = renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      demoRoutes={{
        home: `/demo/${slug}${q}`,
        about: `/demo/${slug}/hakkimizda${q}`,
        aboutPageSlug: resolveAboutDetail(site)?.pageSlug ?? null,
        services: {
          listSlug: resolved.listSlug,
          list: `/demo/${slug}/hizmetler${q}`,
          itemBase: `/demo/${slug}/hizmet`,
          query: q,
        },
      }}
      initialPage={resolved.listSlug}
      initialService={service === 'list' ? null : service}
    />,
  )
  return { html, hrefs: hrefsOf(html), resolved, q }
}

describe('all 8 demos ship a services list and at least two service pages', () => {
  it('covers all 8 demos', () => expect(demos).toHaveLength(8))

  for (const demo of demos) {
    for (const lang of ['tr', 'en'] as const) {
      it(`${demo.slug} (${lang}): list + 2 detail pages, hrefs go straight to /demo/${demo.slug}/...`, () => {
        const list = render(demo.slug, lang, 'list')
        expect(list.resolved.pageActive).toBe(true)
        const enabled = list.resolved.items.filter((i) => i.pageEnabled)
        expect(enabled.length).toBeGreaterThanOrEqual(2)

        const itemHrefs = list.hrefs.filter((h) => h.startsWith(`/demo/${demo.slug}/hizmet/`))
        for (const entry of enabled.slice(0, 2)) {
          expect(itemHrefs).toContain(`/demo/${demo.slug}/hizmet/${entry.slug}${list.q}`)
        }
        const leaks = list.hrefs.filter(
          (h) => h.startsWith('/') && !h.startsWith(`/demo/${demo.slug}`) && !/^(\/#showcase|\/yasal\/)/.test(h),
        )
        expect(leaks).toEqual([])
        expect(PLACEHOLDER.test(list.html)).toBe(false)

        for (const entry of enabled.slice(0, 2)) {
          const detail = render(demo.slug, lang, entry.slug)
          expect(detail.html).toContain(entry.title.replace(/&/g, '&amp;'))
          expect(detail.hrefs).toContain(`/demo/${demo.slug}/hizmetler${detail.q}`)
          const detailLeaks = detail.hrefs.filter(
            (h) => h.startsWith('/') && !h.startsWith(`/demo/${demo.slug}`) && !/^(\/#showcase|\/yasal\/)/.test(h),
          )
          expect(detailLeaks).toEqual([])
          expect(PLACEHOLDER.test(detail.html)).toBe(false)
        }
      })
    }
  }

  it('every demo service carries the example flag', () => {
    for (const demo of demos) {
      const items = resolveServices(buildDemoSite(demo, 'tr'))!.items
      expect(items.every((i) => i.sample)).toBe(true)
    }
  })
})
