import { isLegalDocHidden } from '@/lib/site-legal-docs'
import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * The cookie banner links to the site's own Cookie Policy. A site whose owner
 * hid that document falls back to its Privacy Policy, and when that one is
 * hidden too the banner shows no link at all (never a link to a 404).
 */
export type CookieBannerDoc = 'cerez-politikasi' | 'gizlilik-politikasi'

export const COOKIE_BANNER_DOC_LABEL: Record<CookieBannerDoc, { tr: string; en: string }> = {
  'cerez-politikasi': { tr: 'Çerez Politikası', en: 'Cookie Policy' },
  'gizlilik-politikasi': { tr: 'Gizlilik Politikası', en: 'Privacy Policy' },
}

export function resolveCookieBannerDoc(site: WebsiteSchema | null | undefined): CookieBannerDoc | null {
  if (!site) return null
  if (!isLegalDocHidden(site, 'cerez-politikasi')) return 'cerez-politikasi'
  if (!isLegalDocHidden(site, 'gizlilik-politikasi')) return 'gizlilik-politikasi'
  return null
}

/** Banner link target under the page's own prefix (`/site/<slug>` on the platform host, empty on a tenant host). */
export function cookieBannerHref(doc: CookieBannerDoc | null, pathname: string): string | null {
  if (!doc) return null
  const tenant = pathname.match(/^\/site\/([^/]+)/)
  return tenant ? `/site/${tenant[1]}/yasal/${doc}` : `/yasal/${doc}`
}
