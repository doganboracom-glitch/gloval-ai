import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'
import { findPublicService, resolveServices, servicePath, syncServicesPage } from '@/lib/service-pages'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { SectionInspector } from '@/components/editor/section-inspector'
import { LanguageProvider } from '@/components/language-provider'

type Services = Extract<WebsiteSchema['sections'][number], { type: 'services' }>

const ON = { pageEnabled: true, linkEnabled: true }

function siteWith(items: Services['items'], lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  const base = fallbackWebsite('kahve atölyesi', lang)
  const rest = base.sections.filter((s) => s.type !== 'services')
  const at = Math.max(0, rest.findIndex((s) => s.type === 'footer'))
  const section: Services = { type: 'services', title: 'Hizmetlerimiz', items, detail: ON }
  const raw = { ...base, sections: [...rest.slice(0, at), section, ...rest.slice(at)], pages: undefined }
  return syncServicesPage(raw as unknown as WebsiteSchema)
}

const ONE: Services['items'] = [{ title: 'Kahve eğitimi', description: 'Demleme atölyesi.' }]
const TWO: Services['items'] = [...ONE, { title: 'Kurumsal ikram', description: 'Ofis kahve servisi.' }]

describe('a services section with a single service', () => {
  const site = siteWith(ONE)
  const resolved = resolveServices(site)!
  const list = resolved.listSlug
  const slug = resolved.items[0].slug

  it('resolves with pages active and exactly one item', () => {
    expect(resolved.pageActive).toBe(true)
    expect(resolved.items).toHaveLength(1)
    expect(findPublicService(site, list, slug)).not.toBeNull()
  })

  it('list page shows the one service as a card linking to its page', () => {
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={list} />)
    expect(html).toContain('id="services-detail"')
    expect(html).toContain(`href="${servicePath(list, slug)}"`)
    expect(html.match(new RegExp(`href="${servicePath(list, slug)}"`, 'g'))?.length).toBe(1)
  })

  it('detail page hides the "Diğer hizmetler" sidebar entirely', () => {
    const html = renderToStaticMarkup(
      <WebsiteRenderer site={site} pageRouting initialPage={list} initialService={slug} />,
    )
    expect(html).toContain('id="service-detail"')
    expect(html).toContain('Kahve eğitimi')
    expect(html).not.toContain('Diğer hizmetler')
    expect(html).not.toContain('<aside')
  })

  it('English single-service detail also hides "Other services"', () => {
    const en = siteWith(ONE, 'en')
    const r = resolveServices(en)!
    const html = renderToStaticMarkup(
      <WebsiteRenderer site={en} pageRouting initialPage={r.listSlug} initialService={r.items[0].slug} />,
    )
    expect(html).not.toContain('Other services')
  })

  it('breadcrumb is Home > list > service with the service as the current page', () => {
    const html = renderToStaticMarkup(
      <WebsiteRenderer site={site} pageRouting initialPage={list} initialService={slug} />,
    )
    const nav = html.match(/<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(nav).toContain('Ana sayfa')
    expect(nav).toContain(`href="/${list}"`)
    expect(nav).toMatch(/aria-current="page"[^>]*>Kahve eğitimi</)
    expect(nav.match(/<li /g)).toHaveLength(3)
  })

  it('with two services the sidebar still lists the other one (control)', () => {
    const two = siteWith(TWO)
    const r = resolveServices(two)!
    const html = renderToStaticMarkup(
      <WebsiteRenderer site={two} pageRouting initialPage={r.listSlug} initialService={r.items[0].slug} />,
    )
    expect(html).toContain('Diğer hizmetler')
    expect(html).toContain(servicePath(r.listSlug, r.items[1].slug))
  })
})

describe('tenant sitemap with a single service', () => {
  it('lists the home, the list page and the one service page', async () => {
    const site = siteWith(ONE)
    const r = resolveServices(site)!
    vi.resetModules()
    vi.doMock('@/lib/projects', () => ({ getPublishedSite: async () => ({ schema: site }) }))
    vi.doMock('@/lib/site-availability', () => ({ closedSiteFileResponse: () => new Response('closed', { status: 404 }) }))
    vi.doMock('@/lib/store', () => ({ getStoreProducts: async () => [] }))
    vi.doMock('@/lib/commerce-mode', () => ({ storeSeoPlan: () => ({ indexStore: false }) }))
    vi.doMock('@/lib/commerce-mode-server', () => ({
      getPublishedSiteCommerceMode: async () => null,
      getPublishedSiteRouting: async () => ({ id: null, mode: 'none', projectType: null, catalogPaths: false }),
    }))
    vi.doMock('@/lib/seo/site-seo', () => ({
      getSiteSeoContext: async () => ({ origin: 'https://x.gloval.site', lastModified: null }),
    }))
    vi.doMock('@/lib/blog-server', () => ({ getLiveBlogPosts: async () => [] }))
    const { GET } = await import('@/app/site/[slug]/sitemap.xml/route')
    const res = await GET(new Request('https://x.gloval.site/sitemap.xml'), { params: Promise.resolve({ slug: 'x' }) })
    const xml = await res.text()
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
    expect(locs).toContain('https://x.gloval.site')
    expect(locs).toContain(`https://x.gloval.site/${r.listSlug}`)
    expect(locs).toContain(`https://x.gloval.site${servicePath(r.listSlug, r.items[0].slug)}`)
    expect(locs.filter((l) => l.includes(`/${r.listSlug}/`))).toHaveLength(1)
    vi.doUnmock('@/lib/projects')
  })
})

describe('editor shows why the last item cannot be deleted', () => {
  function inspect(site: WebsiteSchema) {
    const index = site.sections.findIndex((s) => s.type === 'services')
    return renderToStaticMarkup(
      <LanguageProvider initialLang="tr">
        <SectionInspector site={site} index={index} onDispatch={() => {}} />
      </LanguageProvider>,
    )
  }

  it('one item: Sil is disabled and the explanation is visible next to it', () => {
    const html = inspect(siteWith(ONE))
    const removeButtons = html.match(/<button[^>]*aria-label="[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*lucide-trash-2/g) ?? []
    expect(removeButtons).toHaveLength(1)
    expect(removeButtons[0]).toContain('disabled=""')
    expect(html).toContain('data-testid="list-limit-remove-reason"')
    expect(html).toContain('Bu bölümde en az 1 öğe kalmalı.')
  })

  it('two items: Sil is enabled and no explanation is shown', () => {
    const html = inspect(siteWith(TWO))
    const removeButtons = html.match(/<button[^>]*aria-label="[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*lucide-trash-2/g) ?? []
    expect(removeButtons).toHaveLength(2)
    expect(removeButtons.every((b) => !b.includes('disabled=""'))).toBe(true)
    expect(html).not.toContain('list-limit-remove-reason')
  })
})
