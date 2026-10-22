import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Sites published before service pages existed carry no `detail` on their
 * services section. Their HTML, sitemap and routes must stay byte-identical to
 * what `main` produced; the snapshot files in `__snapshots__/published-services-*`
 * were generated on `main` BEFORE the service-pages feature, in a clean worktree.
 */

const state: { site: WebsiteSchema | null } = { site: null }

vi.mock('@/lib/projects', () => ({
  getPublishedSite: async () => (state.site ? { schema: state.site, name: state.site.meta.name } : null),
}))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async () => ({
    origin: 'https://legacy.gloval.site',
    isCustomDomain: false,
    lastModified: '2025-01-01T00:00:00.000Z',
  }),
}))
vi.mock('@/lib/store', () => ({ getStoreProducts: async () => [] }))
vi.mock('@/lib/commerce-mode-server', () => ({
  getPublishedSiteCommerceMode: async () => 'none',
  getPublishedSiteRouting: async () => ({ id: null, mode: 'none', projectType: null, catalogPaths: false }),
}))
vi.mock('@/lib/blog-server', () => ({ getLiveBlogPosts: async () => [] }))

function legacySite(lang: 'tr' | 'en'): WebsiteSchema {
  const base = fallbackWebsite('kahve dükkanı ve atölye', lang)
  const services = {
    type: 'services' as const,
    title: lang === 'tr' ? 'Hizmetlerimiz' : 'Our services',
    items: [
      { title: lang === 'tr' ? 'Kahve eğitimi' : 'Coffee training', description: 'Demleme ve tadım atölyeleri.' },
      { title: lang === 'tr' ? 'Kurumsal ikram' : 'Corporate catering', description: 'Ofisler için kahve servisi.' },
    ],
  }
  const withoutServices = base.sections.filter((s) => s.type !== 'services')
  const footerAt = withoutServices.findIndex((s) => s.type === 'footer')
  const at = footerAt >= 0 ? footerAt : withoutServices.length
  const sections = [...withoutServices.slice(0, at), services, ...withoutServices.slice(at)]
  return {
    ...base,
    sections,
    pages: [
      { slug: 'home', title: base.meta.name, isHome: true },
      { slug: 'hizmetler', title: lang === 'tr' ? 'Hizmetler' : 'Services', sections: [services] },
    ],
  } as WebsiteSchema
}

describe('legacy published sites with a services section render the same HTML as before', () => {
  for (const lang of ['tr', 'en'] as const) {
    for (const page of [null, 'hizmetler'] as const) {
      it(`${page ?? 'home'} / ${lang}`, async () => {
        const html = renderToStaticMarkup(
          <WebsiteRenderer site={legacySite(lang)} pageRouting initialPage={page} />,
        )
        await expect(html).toMatchFileSnapshot(`./__snapshots__/published-services-${page ?? 'home'}-${lang}.html`)
      })
    }
  }
})

describe('legacy published sites keep the same sitemap', () => {
  for (const lang of ['tr', 'en'] as const) {
    it(`sitemap.xml / ${lang}`, async () => {
      state.site = legacySite(lang)
      const { GET } = await import('@/app/site/[slug]/sitemap.xml/route')
      const response = await GET(new Request('https://legacy.gloval.site/sitemap.xml'), {
        params: Promise.resolve({ slug: 'legacy' }),
      })
      await expect(await response.text()).toMatchFileSnapshot(`./__snapshots__/published-services-sitemap-${lang}.xml`)
    })
  }
})
