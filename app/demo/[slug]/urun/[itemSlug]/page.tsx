import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo } from '@/lib/demos'
import { getCatalog, getProduct } from '@/lib/demo-catalog'
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
  const product = getProduct(slug, itemSlug)
  if (!catalog || !product) return {}
  return {
    title: `${product.name[lang]} | ${catalog.brand[lang]}`,
    description: product.short[lang],
    robots: { index: false, follow: true },
    openGraph: { images: [product.image] },
  }
}

export default async function DemoProductDetailPage({
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
  const product = getProduct(slug, itemSlug)
  if (!demo || !catalog || !product) notFound()

  const backLabel =
    lang === 'tr' ? `${catalog.productsLabel.tr}'e dön` : `Back to ${catalog.productsLabel.en}`

  return (
    <DemoChrome slug={slug} lang={lang}>
      <CatalogDetail
        item={product}
        contact={catalog.contact}
        lang={lang}
        backHref={`/demo/${slug}/urunler?lang=${lang}`}
        backLabel={backLabel}
        enableCart={catalog.commerce === true}
        enableTryOn={catalog.commerce === true}
        demoSlug={slug}
      />
    </DemoChrome>
  )
}
