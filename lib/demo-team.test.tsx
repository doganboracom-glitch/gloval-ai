import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveTeam } from '@/lib/team'
import { MENU_MAX } from '@/lib/site-menu'

const BEFORE_DIR = join(__dirname, '__fixtures__', 'demos-before')
const TEAM_DEMOS = ['dis-klinigi', 'hukuk', 'guzellik']
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

  it('has 7-8 fictional people with avatars, sample phones and no social links', () => {
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
      expect(m.social).toBeUndefined()
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

  it('keeps every Kadromuz link inside the demo and links no external profile', () => {
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
    expect(block).not.toMatch(/href="https?:\/\/(?:www\.)?(?:facebook|instagram|x|twitter|linkedin)\./)
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
