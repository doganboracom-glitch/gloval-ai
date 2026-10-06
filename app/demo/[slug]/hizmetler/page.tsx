import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { DemoChrome } from '@/components/demo-site/demo-chrome'
import { CatalogGrid } from '@/components/demo-site/catalog-grid'

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
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)
  const catalog = getCatalog(slug)
  if (!catalog) return {}
  const label = catalog.servicesLabel[lang]
  return {
    title: `${label} | ${catalog.brand[lang]}`,
    description:
      lang === 'tr'
        ? `${catalog.brand[lang]} ${label.toLowerCase()} — gloval.ai demo çalışması.`
        : `${catalog.brand[lang]} ${label.toLowerCase()} — a gloval.ai demo project.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { slug } = await params
  const { lang: langParam } = await searchParams
  const lang = resolveLang(langParam)

  const demo = getDemo(slug)
  const catalog = getCatalog(slug)
  if (!demo || !catalog || catalog.services.length === 0) notFound()

  const subtitle =
    lang === 'tr'
      ? `${catalog.brand[lang]} tarafından sunulan profesyonel hizmetler.`
      : `Professional services offered by ${catalog.brand[lang]}.`

  return (
    <DemoChrome slug={slug} lang={lang}>
      <CatalogGrid
        title={catalog.servicesLabel[lang]}
        subtitle={subtitle}
        items={catalog.services}
        detailHref={(itemSlug) => `/demo/${slug}/hizmet/${itemSlug}?lang=${lang}`}
        lang={lang}
      />
    </DemoChrome>
  )
}
