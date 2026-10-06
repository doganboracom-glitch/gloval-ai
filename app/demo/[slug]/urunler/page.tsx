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

/**
 * Generic product/catalog listing for every demo (menu items, packages,
 * treatments, plans...). The emlak demo has bespoke `/ilanlar` listings, so its
 * products live there and this generic route is intentionally not used for it.
 */
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
  if (!catalog || catalog.products.length === 0) return {}
  const label = catalog.productsLabel[lang]
  return {
    title: `${label} | ${catalog.brand[lang]}`,
    description:
      lang === 'tr'
        ? `${catalog.brand[lang]} ${label.toLowerCase()} — gloval.ai demo çalışması.`
        : `${catalog.brand[lang]} ${label.toLowerCase()} — a gloval.ai demo project.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoProductsPage({
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
  // emlak uses its own /ilanlar listings; no generic products page for it.
  if (!demo || !catalog || catalog.products.length === 0) notFound()

  const subtitle =
    lang === 'tr'
      ? `${catalog.brand[lang]} için özenle hazırlanmış ${catalog.productsLabel.tr.toLowerCase()}.`
      : `A carefully curated ${catalog.productsLabel.en.toLowerCase()} from ${catalog.brand[lang]}.`

  return (
    <DemoChrome slug={slug} lang={lang}>
      <CatalogGrid
        title={catalog.productsLabel[lang]}
        subtitle={subtitle}
        items={catalog.products}
        detailHref={(itemSlug) => `/demo/${slug}/urun/${itemSlug}?lang=${lang}`}
        lang={lang}
      />
    </DemoChrome>
  )
}
