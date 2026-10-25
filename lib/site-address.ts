import { tenantUrl } from '@/lib/domains'

export type SiteAddress = {
  /** Absolute https URL of the address. */
  url: string
  /** URL without the scheme, as shown to the owner. */
  host: string
  /** True only when the address is live and may be opened. */
  published: boolean
}

function toHost(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * The one address the editor shows for a site.
 *
 * Published: the verified custom domain when one is live, otherwise the
 * `<slug>.gloval.site` subdomain actually assigned to the project (which can
 * differ from the name-derived one when the subdomain was already taken).
 * Unpublished: the subdomain the site will be published on; it is never
 * treated as an openable link because nothing is served there yet.
 */
export function resolveSiteAddress(input: {
  published: boolean
  /** Slug assigned to the project, if any. */
  slug: string | null
  /** Slug derived from the site name, used only before one is assigned. */
  draftSlug: string
  /** Origin of a live, verified custom domain bound to this project. */
  customOrigin?: string | null
  /** URL returned by a publish call, for adapters that report one. */
  publishedUrl?: string | null
}): SiteAddress {
  if (input.published) {
    const url = input.customOrigin || (input.slug ? tenantUrl(input.slug) : input.publishedUrl)
    if (url) return { url, host: toHost(url), published: true }
  }
  const url = tenantUrl(input.slug || input.draftSlug)
  return { url, host: toHost(url), published: false }
}
