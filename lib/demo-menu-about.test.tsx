import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { MENU_MAX } from '@/lib/site-menu'
import { resolveAboutDetail } from '@/lib/section-detail'

type Entry = { label: string; href: string }

function anchors(html: string): Entry[] {
  return Array.from(html.matchAll(/<a\s[^>]*?href="([^"]*)"[^>]*>([^<]*)<\/a>/g), (m) => ({
    href: m[1].replace(/&amp;/g, '&'),
    label: m[2].replace(/&amp;/g, '&').trim(),
  }))
}

/** Renders the demo home the way `/demo/[slug]` does and splits the header into desktop and mobile menus. */
function menusOf(slug: string, lang: 'tr' | 'en') {
  const demo = demos.find((d) => d.slug === slug)!
  const site = buildDemoSite(demo, lang)
  const langQuery = lang === 'en' ? '?lang=en' : ''
  const html = renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      demoRoutes={{
        home: `/demo/${slug}${langQuery}`,
        about: `/demo/${slug}/hakkimizda${langQuery}`,
        aboutPageSlug: resolveAboutDetail(site)?.pageSlug ?? null,
      }}
    />,
  )
  const header = html.match(/<header[\s\S]*?<\/header>/)![0]
  const desktopNav = header.match(/<nav class="hidden[\s\S]*?<\/nav>/)![0]
  const desktop = anchors(desktopNav)
  const mobile = anchors(
    Array.from(header.matchAll(/<a\s[^>]*?class="flex min-h-12[^>]*>[^<]*<\/a>/g), (m) => m[0]).join(''),
  )
  return { desktop, mobile, labels: site.navigation.links.map((l) => l.label), links: site.navigation.links }
}

describe('demo top menus include Hakkımızda', () => {
  it('covers all 8 demos', () => {
    expect(demos).toHaveLength(8)
  })

  for (const demo of demos) {
    for (const lang of ['tr', 'en'] as const) {
      const aboutLabel = lang === 'tr' ? 'Hakkımızda' : 'About'
      const aboutHref = `/demo/${demo.slug}/hakkimizda?lang=${lang}`

      it(`${demo.slug} (${lang}): About sits right after Home and links to the demo's own about page`, () => {
        const { desktop } = menusOf(demo.slug, lang)
        const labels = desktop.map((a) => a.label)
        expect(labels.filter((l) => l === aboutLabel)).toHaveLength(1)
        expect(labels.indexOf(aboutLabel)).toBe(1)
        expect(desktop.find((a) => a.label === aboutLabel)!.href).toBe(aboutHref)
        expect(desktop.length).toBeLessThanOrEqual(MENU_MAX)
      })

      it(`${demo.slug} (${lang}): every menu href stays inside the demo`, () => {
        const { desktop, mobile } = menusOf(demo.slug, lang)
        for (const { href } of [...desktop, ...mobile]) {
          const inside = href.startsWith('#') || href.startsWith(`/demo/${demo.slug}/`) || href === `/demo/${demo.slug}`
          expect(inside, href).toBe(true)
        }
      })

      it(`${demo.slug} (${lang}): the mobile menu has the same items in the same order`, () => {
        const { desktop, mobile } = menusOf(demo.slug, lang)
        expect(mobile.length).toBeGreaterThan(0)
        expect(mobile).toEqual(desktop)
      })
    }
  }
})
