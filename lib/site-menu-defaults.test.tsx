import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { resolveAboutDetail } from '@/lib/section-detail'
import { addMissingToMenu, findMenuGaps, MENU_MAX, resolveHeaderMenu } from '@/lib/site-menu'
import { pageNavItems } from '@/lib/website-pages'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

function onePage(prompt: string): WebsiteSchema {
  const site = fallbackWebsite(prompt, 'tr')
  site.pages = [{ slug: 'home', title: 'Ana Sayfa', isHome: true } as WebsiteSchema['pages'][number]]
  for (const type of ['about', 'services', 'contact'] as const) {
    if (!site.sections.some((s) => s.type === type)) site.sections.push({ type } as WebsiteSchema['sections'][number])
  }
  site.navigation.links = []
  return site
}

const labels = (site: WebsiteSchema) =>
  resolveHeaderMenu({ pages: pageNavItems(site), links: site.navigation.links, blog: false, blogLabel: '' }).map((e) => e.label)

describe('default menu for new sites', () => {
  for (const prompt of ['kahve dükkanı', 'diş kliniği', 'emlak ofisi']) {
    it(`${prompt}: About, Services and Contact are in the menu, once`, () => {
      const site = addMissingToMenu(onePage(prompt), 'tr')
      expect(labels(site)).toEqual(['Hakkımızda', 'Hizmetlerimiz', 'İletişim'])
      expect(addMissingToMenu(site, 'tr')).toBe(site)
    })
  }

  it('never pushes the header past MENU_MAX and leaves a full legacy menu alone', () => {
    const site = onePage('kahve dükkanı')
    site.navigation.links = Array.from({ length: MENU_MAX - 1 }, (_, i) => ({ label: `Bağlantı ${i}`, href: `#x${i}` }))
    const capped = addMissingToMenu(site, 'tr')
    expect(labels(capped)).toHaveLength(MENU_MAX)
    const legacy = onePage('kahve dükkanı')
    legacy.navigation.links = Array.from({ length: MENU_MAX + 2 }, (_, i) => ({ label: `Bağlantı ${i}`, href: `#x${i}` }))
    expect(findMenuGaps(legacy)).toEqual([])
    expect(addMissingToMenu(legacy, 'tr')).toBe(legacy)
  })

  it('an existing site is only changed when the owner accepts the suggestion, and the answer sticks', () => {
    const site = onePage('kahve dükkanı')
    const dismissed = applyOperation(site, { op: 'resolveContactSuggestion', accept: false })
    expect(dismissed.navigation.links).toEqual(site.navigation.links)
    expect(dismissed.navigation.contactSuggestionDismissed).toBe(true)
    const accepted = applyOperation(site, { op: 'resolveContactSuggestion', accept: true, lang: 'tr' })
    expect(accepted.navigation.links.map((l) => l.label)).toEqual(['Hakkımızda', 'Hizmetlerimiz', 'İletişim'])
    expect(accepted.navigation.contactSuggestionDismissed).toBe(true)
  })
})

function menuAnchors(html: string, scope: 'desktop' | 'mobile') {
  const nav =
    scope === 'desktop'
      ? html.match(/<nav class="hidden[^>]*>([\s\S]*?)<\/nav>/)![1]
      : html.match(/<nav aria-label="[^"]*" class="py-2">([\s\S]*?)<\/nav>/)![1]
  return Array.from(nav.matchAll(/<a\s[^>]*?href="([^"]*)"[^>]*>([^<]*)<\/a>/g), (m) => ({ href: m[1].replace(/&amp;/g, '&'), label: m[2] }))
}

describe('desktop and mobile menus are the same list', () => {
  for (const demo of demos) {
    it(`${demo.slug}: same entries, same order, hrefs stay inside /demo/${demo.slug}`, () => {
      const site = buildDemoSite(demo, 'tr')
      const html = renderToStaticMarkup(
        <WebsiteRenderer
          site={site}
          demoRoutes={{ home: `/demo/${demo.slug}`, about: `/demo/${demo.slug}/hakkimizda`, aboutPageSlug: resolveAboutDetail(site)?.pageSlug ?? null }}
          initialPage={null}
        />,
      )
      const desktop = menuAnchors(html, 'desktop')
      expect(desktop.length).toBeGreaterThan(0)
      expect(menuAnchors(html, 'mobile')).toEqual(desktop)
      for (const { href } of desktop) {
        if (href.startsWith('#') || /^https?:/.test(href)) continue
        expect(href.startsWith(`/demo/${demo.slug}`)).toBe(true)
      }
    })
  }
})
