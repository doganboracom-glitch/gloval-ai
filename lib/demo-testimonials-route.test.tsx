import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { resolveTestimonials } from '@/lib/testimonials'

type Lang = 'tr' | 'en'

/** Mirrors what `app/demo/[slug]/page.tsx` hands to the renderer for `/demo/<slug>/musteri-yorumlari`. */
function renderDemoRoute(slug: string, lang: Lang, onReviewsRoute: boolean): string {
  const demo = demos.find((d) => d.slug === slug)!
  const site = buildDemoSite(demo, lang)
  const query = `?lang=${lang}`
  const resolved = resolveTestimonials(site, { demo: true })
  const routes = resolved.active ? { slug: resolved.slug, list: `/demo/${slug}/musteri-yorumlari${query}` } : undefined
  return renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      initialPage={onReviewsRoute ? (routes?.slug ?? null) : null}
      demoRoutes={{
        home: `/demo/${slug}${query}`,
        about: `/demo/${slug}/hakkimizda${query}`,
        aboutPageSlug: null,
        testimonials: routes,
      }}
    />,
  )
}

describe.each(demos.flatMap((d) => (['tr', 'en'] as const).map((lang) => [d.slug, lang] as const)))(
  'demo %s reviews route (%s)',
  (slug, lang) => {
    const tag = lang === 'en' ? 'Example review' : 'Örnek yorum'
    const own = `/demo/${slug}/musteri-yorumlari?lang=${lang}`

    it('opens the reviews page, not the home page, at the direct address', () => {
      const html = renderDemoRoute(slug, lang, true)
      expect(html).toContain('id="testimonials-detail"')
      expect(html.match(new RegExp(tag, 'g'))?.length).toBe(6)
      expect(renderDemoRoute(slug, lang, false)).not.toContain('id="testimonials-detail"')
    })

    it('links the menu straight to the demo reviews address', () => {
      const html = renderDemoRoute(slug, lang, false)
      expect(html).toContain(`href="${own.replace(/&/g, '&amp;')}"`)
    })

    it('never links out of the demo and breadcrumbs back to the demo home', () => {
      const html = renderDemoRoute(slug, lang, true)
      for (const m of html.matchAll(/href="([^"]*(?:musteri-yorumlari|reviews)[^"]*)"/g)) {
        expect(m[1].startsWith(`/demo/${slug}/musteri-yorumlari`)).toBe(true)
      }
      expect(html).toContain(`href="/demo/${slug}?lang=${lang}"`)
    })

    it('shows the same reviews on the page as in the home section', () => {
      const page = renderDemoRoute(slug, lang, true)
      const home = renderDemoRoute(slug, lang, false)
      const demo = demos.find((d) => d.slug === slug)!
      const first = resolveTestimonials(buildDemoSite(demo, lang), { demo: true }).items.slice(0, 3)
      for (const item of first) {
        const quote = item.quote.replace(/'/g, '&#x27;')
        expect(page).toContain(quote)
        expect(home).toContain(quote)
      }
    })
  },
)
