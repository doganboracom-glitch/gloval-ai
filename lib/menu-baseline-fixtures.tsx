import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import type { SiteBlogData } from '@/lib/blog-site'

export type MenuBaselineCase = {
  name: string
  html: () => string
}

const blog: SiteBlogData = {
  hrefBase: '',
  posts: [
    {
      slug: 'ilk-yazi',
      title: 'İlk yazı',
      excerpt: null,
      coverUrl: null,
      coverAlt: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

function published(slug: string, withBlog: boolean, page: string | null = null): string {
  const demo = demos.find((d) => d.slug === slug)!
  const site = buildDemoSite(demo, 'tr')
  return renderToStaticMarkup(
    <WebsiteRenderer site={site} pageRouting initialPage={page} blog={withBlog ? blog : null} />,
  )
}

/** Published-site renders (no preview, no demo routes) for sites that never saw the menu feature. */
export const MENU_BASELINE_CASES: MenuBaselineCase[] = [
  { name: 'kahve-home', html: () => published('kahve', false) },
  { name: 'dis-klinigi-home-blog', html: () => published('dis-klinigi', true) },
  { name: 'eticaret-home', html: () => published('eticaret', false) },
  { name: 'emlak-home-blog', html: () => published('emlak', true) },
]
