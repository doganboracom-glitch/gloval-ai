import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { syncGalleryPages } from '@/lib/gallery-pages'
import { resolveFooterPages, resolveHeaderMenu, withGalleryChildren } from '@/lib/site-menu'
import { pageNavItems } from '@/lib/website-pages'
import type { WebsiteSchema } from '@/lib/website-schema'

const VIDEO = {
  id: 'v1',
  name: 'Tanıtım',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  provider: 'youtube' as const,
  videoId: 'dQw4w9WgXcQ',
}

type Options = {
  photos?: boolean
  videos?: boolean
  /** Which of the two pages the owner switched on in "Sayfalar". */
  header?: { gallery?: boolean; videos?: boolean }
  menuOrder?: string[]
}

/** A dbajans-like site: gallery section, one album, one video; every sub-page is a detail page. */
function galleryFixture({ photos = true, videos = true, header = { gallery: true, videos: true }, menuOrder }: Options = {}): WebsiteSchema {
  const base = buildDemoSite(demos.find((d) => d.slug === 'kahve')!, 'tr')
  const sections = base.sections.map((s) =>
    s.type === 'gallery'
      ? {
          ...s,
          albums: [{ id: 'a1', name: 'Mekan', slug: 'mekan' }],
          items: s.items.map((item) => ({ ...item, album: 'Mekan', src: photos ? 'https://x.test/a.jpg' : undefined })),
          videos: videos ? [VIDEO] : [],
        }
      : s,
  )
  const synced = syncGalleryPages({ ...base, sections })
  return {
    ...synced,
    pages: synced.pages.map((p) => {
      if (p.detailOf === 'gallery') return { ...p, id: 'galeri', ...(header.gallery !== undefined ? { showInHeader: header.gallery } : {}) }
      if (p.detailOf === 'videos') return { ...p, id: 'videolar', ...(header.videos !== undefined ? { showInHeader: header.videos } : {}) }
      return p
    }),
    navigation: { ...synced.navigation, ...(menuOrder ? { menuOrder } : {}) },
  }
}

const render = (site: WebsiteSchema, page: string | null = null) =>
  renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={page} />)

const desktopNav = (html: string) => html.match(/<nav class="hidden[\s\S]*?<\/nav>/)?.[0] ?? ''
const anchors = (html: string, href: string) => html.split(`href="${href}"`).length - 1

describe('gallery sub-menu in the header', () => {
  it('reproduces the reported site: Galeri and Videolar are both switched on, Videolar sits before Galeri', () => {
    const site = galleryFixture({ menuOrder: ['videolar', 'galeri'] })
    const items = pageNavItems(site)
    // The pages exist and are live, so the page list is not what hides them.
    expect(items.filter((p) => p.detailOf === 'gallery' || p.detailOf === 'videos').every((p) => !p.unpublished)).toBe(true)
    const nav = desktopNav(render(site))
    expect(nav).toContain('aria-haspopup="true"')
    expect(anchors(nav, '/videolar')).toBe(1)
  })

  it.each([
    ['Galeri only', { header: { gallery: true, videos: undefined } }],
    ['Galeri only, Videolar switched off', { header: { gallery: true, videos: false } }],
    ['both, Galeri first', { menuOrder: ['galeri', 'videolar'] }],
    ['both, Videolar first', { menuOrder: ['videolar', 'galeri'] }],
  ] satisfies [string, Options][])('photos + video, %s: one Galeri entry with Resimler and Videolar children', (_, options) => {
    const html = render(galleryFixture(options))
    const nav = desktopNav(html)
    expect(nav.match(/data-submenu-root/g)).toHaveLength(1)
    expect(nav).toContain('aria-haspopup="true"')
    expect(nav).toContain('aria-expanded="false"')
    // Raw HTML: the parent and both children are real anchors, exactly once each (no duplicate Videolar).
    expect(anchors(nav, '/galeri')).toBe(2)
    expect(anchors(nav, '/videolar')).toBe(1)
    expect(nav).toMatch(/<a href="\/galeri"[^>]*>Galeri<\/a>/)
    expect(nav).toMatch(/<a href="\/galeri"[^>]*>Resimler<\/a>/)
    expect(nav).toMatch(/<a href="\/videolar"[^>]*>Videolar<\/a>/)
  })

  it('mobile menu carries the same sub-menu as an accordion', () => {
    const html = render(galleryFixture({ menuOrder: ['videolar', 'galeri'] }))
    expect(html.match(/aria-haspopup="true"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(anchors(html, '/videolar')).toBe(anchors(desktopNav(html), '/videolar') * 2)
  })

  it('photos only: Galeri stays a single plain entry', () => {
    const nav = desktopNav(render(galleryFixture({ videos: false })))
    expect(nav).not.toContain('aria-haspopup')
    expect(anchors(nav, '/galeri')).toBe(1)
    expect(anchors(nav, '/videolar')).toBe(0)
  })

  it('videos only: a single plain Videolar entry and no Galeri', () => {
    const nav = desktopNav(render(galleryFixture({ photos: false })))
    expect(nav).not.toContain('aria-haspopup')
    expect(anchors(nav, '/videolar')).toBe(1)
    expect(anchors(nav, '/galeri')).toBe(0)
  })

  it('the parent is current while the videos page is open', () => {
    const nav = desktopNav(render(galleryFixture(), 'videolar'))
    expect(nav).toMatch(/<a href="\/galeri" aria-current="page"[^>]*>Galeri<\/a>/)
  })

  it('without a live videos page nothing changes in the menu resolution', () => {
    const site = galleryFixture({ videos: false })
    const pages = pageNavItems(site)
    const entries = resolveHeaderMenu({ pages, links: site.navigation.links, blog: false, blogLabel: '' })
    expect(withGalleryChildren(entries, (p) => `/${p.slug}`, pages)).toBe(entries)
  })

  it('footer lists Videolar next to Galeri whenever the header would', () => {
    const site = galleryFixture({ header: { gallery: true, videos: undefined } })
    const withFooter = { ...site, pages: site.pages.map((p) => (p.detailOf === 'gallery' ? { ...p, showInFooter: true } : p)) }
    const slugs = resolveFooterPages(pageNavItems(withFooter), withFooter.navigation.menuOrder).map((p) => p.slug)
    expect(slugs).toEqual(['galeri', 'videolar'])
  })
})

describe('sites without gallery videos keep their header HTML', () => {
  it('a site with a gallery but no video renders the same menu as before', () => {
    const site = galleryFixture({ videos: false })
    const nav = desktopNav(render(site))
    expect(nav).not.toContain('data-submenu-root')
  })

  it.each(demos.map((d) => d.slug))('demo %s has no sub-menu', (slug) => {
    const site = buildDemoSite(demos.find((d) => d.slug === slug)!, 'tr')
    expect(desktopNav(render(site))).not.toContain('aria-haspopup')
  })
})
