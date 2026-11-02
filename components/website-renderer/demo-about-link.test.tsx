// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { WebsiteRenderer, type PreviewNav } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import luna from '@/lib/__fixtures__/published/luna-mucevher.json'
import { fallbackWebsite, isStorefront, type WebsiteSchema } from '@/lib/website-schema'

beforeAll(() => {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
})

afterEach(cleanup)

const portfolioMenuLinks = [
  { label: 'Portfolyo', href: '#about' },
  { label: 'Galeri', href: '#about' },
  { label: 'Hizmetler', href: '#about' },
  { label: 'Hakkında', href: '#about' },
  { label: 'SSS', href: '#about' },
  { label: 'İletişim', href: '#about' },
]

const portfolioLegalLinks = [
  { label: 'Gizlilik Politikası', href: '/yasal/gizlilik-politikasi' },
  { label: 'Çerez Politikası', href: '/yasal/cerez-politikasi' },
]

function createPortfolioSite() {
  const site = fallbackWebsite('Atölye Portfolyo fotoğraf galerisi', 'tr')
  site.pages = [{ slug: 'home', title: 'Ana Sayfa', isHome: true } as WebsiteSchema['pages'][number]]
  if (!site.sections.some((section) => section.type === 'about')) {
    const about = fallbackWebsite('mimarlık stüdyosu', 'tr').sections.find((section) => section.type === 'about')
    if (about) site.sections.push(about)
  }

  let hasFooter = false
  site.sections = site.sections.map((section) => {
    if (section.type !== 'footer') return section
    hasFooter = true
    return {
      ...section,
      columns: [{ title: 'Atölye', links: portfolioMenuLinks }],
      legal: { links: portfolioLegalLinks },
    }
  })
  if (!hasFooter) {
    site.sections.push({
      type: 'footer',
      columns: [{ title: 'Atölye', links: portfolioMenuLinks }],
      legal: { links: portfolioLegalLinks },
    } as WebsiteSchema['sections'][number])
  }
  site.navigation.links = portfolioMenuLinks
  return site
}

describe('demo home "Daha fazlası…" link', () => {
  it('opens the long about page in place instead of leaving the demo', () => {
    const site = buildDemoSite(demos[0], 'tr')
    const { container } = render(<WebsiteRenderer site={site} />)

    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/hakkimizda')

    // fireEvent returns false when preventDefault was called, i.e. the browser
    // will not navigate to gloval.ai/hakkimizda (which is a 404).
    const notPrevented = fireEvent.click(link!)
    expect(notPrevented).toBe(false)
    expect(container.querySelector('a[href="/hakkimizda"]')).toBeNull()
  })

  it('soft-navigates to /demo/<slug>/hakkimizda and back to the demo home via the breadcrumb', async () => {
    const { resolveAboutDetail } = await import('@/lib/section-detail')
    const site = buildDemoSite(demos[0], 'tr')
    const aboutPageSlug = resolveAboutDetail(site)?.pageSlug ?? null
    expect(aboutPageSlug).toBeTruthy()
    const slug = demos[0].slug
    const demoRoutes = { home: `/demo/${slug}`, about: `/demo/${slug}/hakkimizda`, aboutPageSlug }
    const onDemoRoute = vi.fn()

    const home = render(<WebsiteRenderer site={site} demoRoutes={demoRoutes} onDemoRoute={onDemoRoute} />)
    const more = Array.from(home.container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(fireEvent.click(more!)).toBe(false)
    expect(onDemoRoute).toHaveBeenCalledWith(`/demo/${slug}/hakkimizda`)
    home.unmount()

    onDemoRoute.mockClear()
    const about = render(
      <WebsiteRenderer site={site} initialPage={aboutPageSlug} demoRoutes={demoRoutes} onDemoRoute={onDemoRoute} />,
    )
    const crumb = about.container.querySelector('nav[aria-label="Breadcrumb"] a')
    expect(crumb).toBeTruthy()
    expect(fireEvent.click(crumb!)).toBe(false)
    expect(onDemoRoute).toHaveBeenCalledWith(`/demo/${slug}`)
  })

  it('applies identical target pruning in editor preview and published renders', () => {
    const base = buildDemoSite(demos[0], 'tr')
    const site = {
      ...base,
      sections: base.sections.map((section) =>
        section.type === 'hero'
          ? {
              ...section,
              primaryButton: { label: 'Hakkımızda', href: '#about' },
              secondaryButton: { label: 'Top 10', href: '#top-10' },
            }
          : section,
      ),
    }
    const previewNav: PreviewNav = {
      slug: null,
      published: false,
      onStoreRoute: () => {},
      onBlogRoute: () => {},
      onLegalRoute: () => {},
    }

    const preview = render(<WebsiteRenderer site={site} preview={previewNav} />)
    expect(preview.container.querySelector('a[href="#top-10"]')).toBeNull()
    expect(preview.container.querySelector('a[href="#about"]')).toBeTruthy()
    preview.unmount()

    const published = render(<WebsiteRenderer site={site} pageRouting />)
    expect(published.container.querySelector('a[href="#top-10"]')).toBeNull()
    expect(published.container.querySelector('a[href="#about"]')).toBeTruthy()
  })

  it('still lets a published multi-page site navigate for real', () => {
    const site = buildDemoSite(demos[0], 'tr')
    const { container } = render(<WebsiteRenderer site={site} pageRouting />)
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(link).toBeTruthy()
  })

  it.each([false, true])(
    'keeps the Atölye Portfolyo menu and footer out of store routing (published preview: %s)',
    (published) => {
      const site = createPortfolioSite()
      expect(isStorefront(site)).toBe(false)

      const onStoreRoute = vi.fn()
      const onLegalRoute = vi.fn()
      const view = render(
        <WebsiteRenderer
          site={site}
          preview={{
            slug: published ? 'atolye-portfolyo' : null,
            published,
            onStoreRoute,
            onBlogRoute: vi.fn(),
            onLegalRoute,
          }}
        />,
      )

      const labels = [...portfolioMenuLinks, ...portfolioLegalLinks].map((link) => link.label)
      for (const label of labels) {
        const links = Array.from(view.container.querySelectorAll('a')).filter((anchor) => anchor.textContent?.trim() === label)
        expect(links.length, `${label} should be visible in the menu or footer`).toBeGreaterThan(0)
        for (const link of links) fireEvent.click(link)
      }

      expect(onStoreRoute).not.toHaveBeenCalled()
      expect(onLegalRoute).toHaveBeenCalledWith('/yasal/gizlilik-politikasi')
      expect(onLegalRoute).toHaveBeenCalledWith('/yasal/cerez-politikasi')
    },
  )

  it('keeps every Atölye Portfolyo menu and footer link on the published renderer', () => {
    const site = createPortfolioSite()
    const view = render(<WebsiteRenderer site={site} pageRouting />)
    const labels = [...portfolioMenuLinks, ...portfolioLegalLinks].map((link) => link.label)
    view.container.addEventListener('click', (event) => event.preventDefault(), true)

    for (const label of labels) {
      const links = Array.from(view.container.querySelectorAll('a')).filter((anchor) => anchor.textContent?.trim() === label)
      expect(links.length, `${label} should be visible in the published site`).toBeGreaterThan(0)
      for (const link of links) fireEvent.click(link)
    }

    expect(view.container.querySelector('a[href^="/store"], a[href^="/urunlerimiz"], a[href="/cart"]')).toBeNull()
  })

  it.each([false, true])('forwards only real product and cart routes from a storefront preview (published: %s)', (published) => {
    const source = luna as unknown as WebsiteSchema
    const menuLinks = [
      { label: 'Ürün kataloğu', href: '/urunlerimiz' },
      { label: 'Mağaza', href: '/store' },
      { label: 'Ürün detayı', href: '/store/test-product' },
      { label: 'Sepet sayfası', href: '/cart' },
    ]
    const cartAnchor = { label: 'Sepet', href: '#cart' }
    const site = {
      ...source,
      pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
      navigation: { ...source.navigation, links: menuLinks },
      sections: source.sections.map((section) =>
        section.type === 'footer' ? { ...section, columns: [{ title: 'Mağaza', links: [cartAnchor] }] } : section,
      ),
    } as WebsiteSchema
    expect(isStorefront(site)).toBe(true)

    const onStoreRoute = vi.fn()
    const view = render(
      <WebsiteRenderer
        site={site}
        preview={{
          slug: published ? 'luna' : null,
          published,
          onStoreRoute,
          onBlogRoute: vi.fn(),
          onLegalRoute: vi.fn(),
        }}
      />,
    )

    const expected = [
      ['Ürün kataloğu', '/urunlerimiz'],
      ['Mağaza', '/store'],
      ['Ürün detayı', '/store/test-product'],
      ['Sepet sayfası', '/cart'],
      ['Sepet', '/cart'],
    ] as const
    for (const [label] of expected) {
      const link = Array.from(view.container.querySelectorAll('a')).find((anchor) => anchor.textContent?.trim() === label)
      expect(link, `${label} should be a storefront link`).toBeTruthy()
      expect(fireEvent.click(link!)).toBe(false)
    }
    expect(onStoreRoute.mock.calls.map(([path]) => path)).toEqual(expected.map(([, path]) => path))
  })
})
