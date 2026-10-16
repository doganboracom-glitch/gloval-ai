import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { SITE_LEGAL_DISCLAIMER } from '@/lib/site-legal-templates'
import { formatLegalDate, resolveLegalDoc } from '@/lib/site-legal-docs'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getSiteBlogData } from '@/lib/blog-server'
import { LegalBlocks } from '@/components/legal/legal-blocks'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>
}): Promise<Metadata> {
  const { slug, doc } = await params
  const site = await getPublishedSite(slug)
  const page = site ? resolveLegalDoc(doc, site.schema, site.name) : null
  // Boilerplate legal text is near-identical across sites, so it stays out of
  // search results (noindex) while links on the page can still be followed.
  return page
    ? { title: `${page.title} — ${site?.name}`, robots: { index: false, follow: true } }
    : { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }
}

export default async function SiteLegalPage({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>
}) {
  const { slug, doc } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const page = resolveLegalDoc(doc, site.schema, site.name)
  if (!page) notFound()

  return (
    <StoreSiteShell site={site.schema} slug={slug} blog={await getSiteBlogData(slug)}>
      <article
        className="mx-auto w-full max-w-3xl px-6 py-14"
        style={{ color: 'var(--site-fg)' }}
      >
        <h1
          className="text-balance text-3xl font-bold tracking-tight"
          style={{ fontFamily: 'var(--site-heading-font)' }}
        >
          {page.title}
        </h1>
        <p
          data-legal-updated
          className="mt-2 text-xs"
          style={{ color: 'var(--site-muted-fg)' }}
        >
          Son güncelleme: {formatLegalDate(page.updatedAt)}
        </p>
        <div className="mt-8">
          <LegalBlocks blocks={page.blocks} />
        </div>
        <p
          role="note"
          data-legal-disclaimer
          className="mt-12 rounded-lg border px-4 py-3 text-pretty text-xs leading-relaxed"
          style={{ borderColor: 'var(--site-border)', color: 'var(--site-muted-fg)' }}
        >
          {SITE_LEGAL_DISCLAIMER}
        </p>
      </article>
    </StoreSiteShell>
  )
}
