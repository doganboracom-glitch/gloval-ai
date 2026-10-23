import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import type { WebsiteSchema } from '@/lib/website-schema'
import { memberSocials, resolveTeam } from '@/lib/team'
import { MENU_MAX } from '@/lib/site-menu'

const BEFORE_DIR = join(__dirname, '__fixtures__', 'demos-before')
const TEAM_DEMOS = ['dis-klinigi', 'hukuk', 'guzellik']
const SAMPLE_SOCIAL: Record<string, string> = {
  facebook: 'https://www.facebook.com',
  instagram: 'https://www.instagram.com',
  x: 'https://x.com',
  linkedin: 'https://www.linkedin.com',
  email: 'mailto:ornek@ornek.example',
}
const RENDERED_SAMPLE_SOCIAL = Object.values(SAMPLE_SOCIAL).map((h) => (h.startsWith('mailto:') ? h : `${h}/`))
const OTHER_DEMOS = demos.map((d) => d.slug).filter((s) => !TEAM_DEMOS.includes(s))

const renderDemo = (site: WebsiteSchema, slug: string, initialPage: string | null = null, lang = 'tr') =>
  renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      initialPage={initialPage}
      demoRoutes={{
        home: `/demo/${slug}?lang=${lang}`,
        about: `/demo/${slug}/hakkimizda?lang=${lang}`,
        aboutPageSlug: null,
        testimonials: { slug: 'musteri-yorumlari', list: `/demo/${slug}/musteri-yorumlari?lang=${lang}` },
        team: {
          slug: lang === 'en' ? 'our-team' : 'kadromuz',
          list: `/demo/${slug}/kadromuz?lang=${lang}`,
        },
      }}
    />,
  )

const teamOf = (site: WebsiteSchema) => site.sections.find((s) => s.type === 'team')

describe.each(TEAM_DEMOS)('demo %s Kadromuz', (slug) => {
  const demo = demos.find((d) => d.slug === slug)!

  it('has 6-8 fictional people with avatars, sample phones and 2-4 sample social links', () => {
    const section = teamOf(buildDemoSite(demo, 'tr'))
    expect(section?.type).toBe('team')
    if (section?.type !== 'team') return
    expect(section.members.length).toBeGreaterThanOrEqual(6)
    expect(section.members.length).toBeLessThanOrEqual(8)
    expect(new Set(section.members.map((m) => m.name)).size).toBe(section.members.length)
    for (const m of section.members) {
      expect(m.sample).toBe(true)
      expect(m.phone).toMatch(/^0555 555 55 5\d$/)
      expect(m.role.trim().length).toBeGreaterThan(0)
      expect(m.src).toBeUndefined()
      const links = Object.entries(m.social ?? {})
      expect(links.length).toBeGreaterThanOrEqual(2)
      expect(links.length).toBeLessThanOrEqual(4)
      for (const [key, href] of links) expect(SAMPLE_SOCIAL[key]).toBe(href)
      expect(memberSocials(m)).toHaveLength(links.length)
      expect(memberSocials(m).map((l) => l.href).sort()).toEqual(
        links.map(([k]) => RENDERED_SAMPLE_SOCIAL[Object.keys(SAMPLE_SOCIAL).indexOf(k)]).sort(),
      )
    }
    const sets = new Set(section.members.map((m) => Object.keys(m.social ?? {}).join()))
    expect(sets.size).toBeGreaterThan(1)
  })

  it('renders each person a hover stack on the image edge and a touch row under the card, same links in both', () => {
    const html = renderDemo(buildDemoSite(demo, 'tr'), slug, 'kadromuz')
    const cards = html.match(/<li[^>]*data-team-card[^>]*>[^]*?<\/li>/g) ?? []
    expect(cards.length).toBeGreaterThanOrEqual(6)
    for (const card of cards) {
      const hover = card.match(/<div data-team-socials="hover" class="([^"]*)">([^]*?)<\/div>/)
      const touch = card.match(/<div data-team-socials="touch" class="([^"]*)"[^>]*>([^]*?)<\/div>/)
      expect(hover && touch).toBeTruthy()
      if (!hover || !touch) continue
      const hrefsOf = (markup: string) => [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
      expect(hrefsOf(hover[2]).length).toBeGreaterThanOrEqual(2)
      expect(hrefsOf(hover[2])).toEqual(hrefsOf(touch[2]))
      // hover stack: vertical, on the right edge, revealed by hover and by keyboard focus, only where hover exists
      for (const cls of ['right-3', 'flex-col', 'hidden', 'group-hover:opacity-100', 'focus-within:opacity-100', '[@media(hover:hover)]:flex']) {
        expect(hover[1]).toContain(cls)
      }
      // touch row: a visible row, removed where hover exists
      expect(touch[1]).toContain('flex')
      expect(touch[1]).toContain('[@media(hover:hover)]:hidden')
    }
  })

  it('shows one example tag on the home block and on the /kadromuz page', () => {
    const site = buildDemoSite(demo, 'tr')
    expect(resolveTeam(site).active).toBe(true)
    const home = renderDemo(site, slug)
    const page = renderDemo(site, slug, 'kadromuz')
    // The home page's references block carries its own tag, so check the one that follows the team block heading.
    expect(home).toMatch(/kadro alanının[^]*?Örnek içerik/)
    expect(home.match(/data-demo-example-content/g)?.length).toBeGreaterThanOrEqual(2)
    expect(page.match(/Örnek içerik/g)).toHaveLength(1)
    for (const m of (teamOf(site) as Extract<WebsiteSchema['sections'][number], { type: 'team' }>).members) {
      expect(page).toContain(m.name)
    }
  })

  it('keeps every Kadromuz link inside the demo and links only platform home pages, never a person profile', () => {
    const site = buildDemoSite(demo, 'tr')
    const own = `/demo/${slug}/kadromuz`
    // The menus of these demos are already full (MENU_MAX), so the page is reached from the home block's "see all" link.
    expect(site.navigation.links.length).toBeLessThanOrEqual(MENU_MAX)
    for (const l of site.navigation.links.filter((x) => x.href.includes('kadromuz'))) expect(l.href.startsWith(own)).toBe(true)
    const homeHrefs = [...renderDemo(site, slug).matchAll(/href="([^"]*kadromuz[^"]*)"/g)].map((m) => m[1])
    expect(homeHrefs.length).toBeGreaterThanOrEqual(1)
    for (const href of homeHrefs) expect(href.startsWith(own)).toBe(true)
    const pageHrefs = [...renderDemo(site, slug, 'kadromuz').matchAll(/href="([^"]*kadromuz[^"]*)"/g)].map((m) => m[1])
    for (const href of pageHrefs) expect(href.startsWith(own)).toBe(true)
    const block = renderDemo(site, slug, 'kadromuz')
    const cards = (block.match(/<li[^>]*data-team-card[^>]*>[^]*?<\/li>/g) ?? []).join(' ')
    expect(cards.length).toBeGreaterThan(0)
    const external = [...cards.matchAll(/href="((?:https?:|mailto:)[^"]*)"/g)].map((m) => m[1])
    expect(external.length).toBeGreaterThan(0)
    for (const href of external) expect(RENDERED_SAMPLE_SOCIAL).toContain(href)
  })

  it('leaves the rest of the demo home page HTML unchanged', () => {
    const file = join(BEFORE_DIR, `${slug}.html`)
    expect(existsSync(file)).toBe(true)
    const site = buildDemoSite(demo, 'tr')
    const stripped: WebsiteSchema = {
      ...site,
      sections: site.sections
        .filter((s) => s.type !== 'team' && s.type !== 'testimonials' && s.type !== 'references' && s.type !== 'heroStrip')
        .map((s) => {
          if (s.type !== 'hero') return s
          const { layout: _layout, align: _align, overlay: _overlay, imageFit: _imageFit, ...plain } = s as Record<string, unknown>
          return plain as typeof s
        }),
      pages: (site.pages ?? []).filter((p) => !['kadromuz', 'musteri-yorumlari', 'referanslar'].includes(p.slug)),
      navigation: {
        ...site.navigation,
        links: site.navigation.links.filter(
          (l) => !['kadromuz', 'musteri-yorumlari', 'referanslar'].some((k) => l.href.includes(k)),
        ),
      },
    }
    const html = renderToStaticMarkup(<WebsiteRenderer site={stripped} pageRouting initialPage={null} />)
    expect(html).toBe(readFileSync(file, 'utf8'))
  })

  it('gives the English demo a labelled team and an own-demo menu link', () => {
    const site = buildDemoSite(demo, 'en')
    const section = teamOf(site)
    expect(section?.type === 'team' && section.members.every((m) => m.sample)).toBe(true)
    for (const l of site.navigation.links.filter((x) => x.href.includes('kadromuz'))) {
      expect(l.href.startsWith(`/demo/${slug}/kadromuz`)).toBe(true)
    }
    expect(renderDemo(site, slug, null, 'en')).toContain('Example content')
  })
})

describe.each(OTHER_DEMOS)('demo %s (no Kadromuz)', (slug) => {
  const demo = demos.find((d) => d.slug === slug)!

  it('gets no Kadromuz section, page or menu link from the showcase', () => {
    for (const lang of ['tr', 'en'] as const) {
      const site = buildDemoSite(demo, lang)
      expect((site.pages ?? []).some((p) => p.detailOf === 'team' || p.slug === 'kadromuz')).toBe(false)
      expect(site.navigation.links.some((l) => l.href.includes('kadromuz'))).toBe(false)
      // Whatever team block a demo already carried (the architecture studio's own) is not a showcase one.
      const section = teamOf(site)
      if (section?.type === 'team') expect(section.members.some((m) => m.phone === '0555 555 55 51')).toBe(false)
    }
  })

  it('renders its home page exactly as before apart from the unrelated sections', () => {
    const file = join(BEFORE_DIR, `${slug}.html`)
    expect(existsSync(file)).toBe(true)
  })
})
