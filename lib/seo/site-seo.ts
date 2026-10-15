import { createAdminClient } from '@/lib/supabase/admin'
import { getDomainProvider } from '@/lib/custom-domains/provider'
import { hydrateRedirects } from '@/lib/custom-domains/redirects'
import { getVercelClient } from '@/lib/custom-domains/vercel'
import { canonicalOrigin, pickCanonicalDomain } from '@/lib/site-origin'

export type SiteSeoContext = {
  /** Origin every canonical, og:url, sitemap, robots and JSON-LD URL must use. */
  origin: string
  /** True when `origin` is a live custom domain rather than `<slug>.gloval.site`. */
  isCustomDomain: boolean
  /** Real last-modified time of the published site (ISO), or null if unknown. */
  lastModified: string | null
}

/**
 * Resolves how a published tenant site presents itself to search engines.
 *
 * Reads the project row (published flag + real timestamps) and its bound custom
 * domains in one place so every SEO surface agrees. A custom domain only wins
 * when it is live AND the site is published; any lookup failure falls back to
 * the `<slug>.gloval.site` origin, which is the pre-existing behaviour.
 */
export async function getSiteSeoContext(slug: string): Promise<SiteSeoContext> {
  const fallback: SiteSeoContext = {
    origin: canonicalOrigin(slug, null),
    isCustomDomain: false,
    lastModified: null,
  }
  try {
    const { data } = await createAdminClient()
      .from('projects')
      .select('id, published, updated_at, published_at')
      .eq('slug', slug)
      .maybeSingle()
    if (!data) return fallback

    const lastModified = latest(data.updated_at, data.published_at)
    if (!data.published) return { ...fallback, lastModified }

    const bound = await getDomainProvider().listActiveForProject(data.id as string)
    const domain = pickCanonicalDomain(await hydrateRedirects(bound, getVercelClient()))
    if (!domain) return { ...fallback, lastModified }

    const origin = canonicalOrigin(slug, domain.domain)
    return { origin, isCustomDomain: origin !== fallback.origin, lastModified }
  } catch (error) {
    console.log('[v0] getSiteSeoContext failed:', error)
    return fallback
  }
}

function latest(...values: Array<string | null | undefined>): string | null {
  let best: number | null = null
  for (const value of values) {
    const time = value ? Date.parse(value) : NaN
    if (!Number.isNaN(time) && (best === null || time > best)) best = time
  }
  return best === null ? null : new Date(best).toISOString()
}
