import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { NON_INDEXABLE_STORE_PATHS } from '@/lib/commerce-mode'

/**
 * robots.txt for a published tenant site.
 *
 * `<slug>.gloval.site/robots.txt` is rewritten onto `/site/<slug>/robots.txt`,
 * so each site advertises its OWN sitemap instead of falling back to the
 * platform's. The sitemap URL uses the site's canonical origin so it matches
 * the URLs listed inside it. Checkout and order pages are transactional and
 * excluded.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const { origin } = await getSiteSeoContext(slug)
  const body = [
    'User-Agent: *',
    'Allow: /',
    ...NON_INDEXABLE_STORE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
