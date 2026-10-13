import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { getStoreLegalPage } from '@/lib/store-legal-pages'
import { StoreSiteShell } from '@/components/store/store-site-shell'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; doc: string }>
}): Promise<Metadata> {
  const { slug, doc } = await params
  const site = await getPublishedSite(slug)
  const page = site ? getStoreLegalPage(doc, site.name) : null
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
  const page = getStoreLegalPage(doc, site.name)
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
      </article>
    </StoreSiteShell>
  )
}
