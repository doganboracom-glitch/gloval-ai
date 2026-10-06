import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo } from '@/lib/demos'
import { getCatalog, getService } from '@/lib/demo-catalog'
import { DemoChrome } from '@/components/demo-site/demo-chrome'
import { CatalogDetail } from '@/components/demo-site/catalog-detail'

// Demo content locale (tr/en only) is a separate, narrower concept from the
// platform UI locale (`Lang`/`SupportedLocale`, now 12 languages).
type DemoLang = 'tr' | 'en'

function resolveLang(value: string | undefined): DemoLang {
  return value === 'en' ? 'en' : 'tr'
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; itemSlug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug, itemSlug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)
  const catalog = getCatalog(slug)
  const service = getService(slug, itemSlug)
  if (!catalog || !service) return {}
  return {
    title: `${service.name[lang]} | ${catalog.brand[lang]}`,
    description: service.short[lang],
    robots: { index: false, follow: true },
    openGraph: { images: [service.image] },
  }
}

export default async function DemoServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; itemSlug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug, itemSlug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)

  const demo = getDemo(slug)
  const catalog = getCatalog(slug)
  const service = getService(slug, itemSlug)
  if (!demo || !catalog || !service) notFound()

  const backLabel =
    lang === 'tr' ? `${catalog.servicesLabel.tr}'e dön` : `Back to ${catalog.servicesLabel.en}`

  return (
    <DemoChrome slug={slug} lang={lang}>
      <CatalogDetail
        item={service}
        contact={catalog.contact}
        lang={lang}
        backHref={`/demo/${slug}/hizmetler?lang=${lang}`}
        backLabel={backLabel}
      />
    </DemoChrome>
  )
}
