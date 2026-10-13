import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import {
  SITE_LEGAL_DISCLAIMER,
  companyFromSite,
  getSiteLegalDoc,
} from '@/lib/site-legal-templates'
import { StoreSiteShell } from '@/components/store/store-site-shell'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>
}): Promise<Metadata> {
  const { slug, doc } = await params
  const site = await getPublishedSite(slug)
  const page = site ? getSiteLegalDoc(doc, companyFromSite(site.name, site.schema.sections)) : null
  return page ? { title: `${page.title} — ${site?.name}` } : { title: 'Sayfa bulunamadı' }
}

export default async function SiteLegalPage({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>
}) {
  const { slug, doc } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  const page = getSiteLegalDoc(doc, companyFromSite(site.name, site.schema.sections))
  if (!page) notFound()

  return (
    <StoreSiteShell site={site.schema} slug={slug}>
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
        <div className="mt-8 grid gap-8">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold">{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p
                  key={p}
                  className="mt-3 text-pretty text-sm leading-relaxed"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
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
