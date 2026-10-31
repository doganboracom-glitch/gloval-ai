import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import { buildTenantSocialMetadata } from '@/lib/seo/site-sharing'
import { SiteCustomCode } from '@/components/site-custom-code'
import { cookieBannerCss } from '@/lib/cookie-banner-theme'
import { CookieBannerDocProvider } from '@/components/cookie-banner-doc-context'
import { CookieConsent } from '@/components/cookie-consent'
import { resolveCookieBannerDoc } from '@/lib/cookie-policy-link'
import { CursorAuraGate } from '@/components/site/cursor-aura-gate'
import { shouldRenderCursorAura } from '@/lib/site-addons'
import { extractMetaTags, safeTrackingCode, sanitizeTracking, stripMetaTags } from '@/lib/site-tracking'

/**
 * Tenant layout for every published page of a site (home, store, checkout…).
 *
 * Its only job is to carry the site owner's custom code into the real HTML
 * output:
 *  - `<meta>` tags from the head snippet go through Next.js metadata, so
 *    verification tags (Search Console, Meta domain verification) land inside
 *    the document `<head>`.
 *  - the remaining head code plus the body-start / body-end snippets are
 *    server-rendered verbatim, so the pasted scripts execute on page load.
 *
 * Sites without custom code render exactly as before.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) {
    return {
      title: 'Site bulunamadı',
      applicationName: null,
      generator: null,
      icons: null,
      openGraph: null,
      twitter: null,
      verification: { google: null },
      robots: { index: false, follow: false },
    }
  }

  const seo = await getSiteSeoContext(slug)
  const social = buildTenantSocialMetadata({
    site,
    slug,
    origin: seo.origin,
    lastModified: seo.lastModified,
  })
  const other = extractMetaTags(safeTrackingCode(site.schema.tracking?.head))
  // The platform's own Google Search Console token belongs to gloval.ai only,
  // so it is dropped here instead of leaking into every published tenant site.
  const faviconSrc = site.schema.navigation.favicon?.src
  const base: Metadata = {
    ...social,
    applicationName: site.name,
    generator: null,
    icons: faviconSrc ? { icon: faviconSrc } : null,
    verification: { google: null },
  }
  return Object.keys(other).length > 0 ? { ...base, other } : base
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Viewport> {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) return {}

  const background = site.schema.theme.palette.find(
    (color) => color.name.toLowerCase() === 'background',
  )?.hex
  return {
    colorScheme: site.schema.theme.mode === 'dark' ? 'dark' : 'light',
    ...(background && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(background)
      ? { themeColor: background }
      : {}),
  }
}

export default async function PublishedSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  // No published site (never published, unpublished, suspended or deleted):
  // every route under this slug, store pages included, answers HTTP 404 with the
  // notice from `app/site/not-found.tsx`. Suspended and unpublished sites are
  // indistinguishable to the public read, so they share the 404.
  if (!site) notFound()
  const tracking = sanitizeTracking(site.schema.tracking)
  const cookieCss = cookieBannerCss(site.schema)
  const cursorAura = await shouldRenderCursorAura(slug, site.schema.effects)

  return (
    <>
      {cookieCss && <style dangerouslySetInnerHTML={{ __html: cookieCss }} />}
      <SiteCustomCode code={stripMetaTags(tracking?.head)} />
      <SiteCustomCode code={tracking?.bodyStart} />
      <CookieBannerDocProvider doc={resolveCookieBannerDoc(site.schema)}>
        {children}
        <CookieConsent variant="site" />
      </CookieBannerDocProvider>
      {cursorAura && <CursorAuraGate config={cursorAura} />}
      <SiteCustomCode code={tracking?.bodyEnd} />
    </>
  )
}
