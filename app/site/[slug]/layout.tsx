import type { Metadata } from 'next'
import { getPublishedSite } from '@/lib/projects'
import { SiteCustomCode } from '@/components/site-custom-code'
import { extractMetaTags, stripMetaTags } from '@/lib/site-tracking'

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
  const other = extractMetaTags(site?.schema.tracking?.head)
  // The platform's own Google Search Console token belongs to gloval.ai only,
  // so it is dropped here instead of leaking into every published tenant site.
  const base: Metadata = { verification: { google: null } }
  // The owner's own favicon (separate from the header logo, see
  // `faviconSchema`) replaces the platform default tab icon on their site.
  const faviconSrc = site?.schema.navigation.favicon?.src
  const withIcon: Metadata = faviconSrc ? { ...base, icons: { icon: faviconSrc } } : base
  return Object.keys(other).length > 0 ? { ...withIcon, other } : withIcon
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
  const tracking = site?.schema.tracking

  return (
    <>
      <SiteCustomCode code={stripMetaTags(tracking?.head)} />
      <SiteCustomCode code={tracking?.bodyStart} />
      {children}
      <SiteCustomCode code={tracking?.bodyEnd} />
    </>
  )
}
