import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { DemoChrome } from '@/components/demo-site/demo-chrome'
import { DemoAccount } from '@/components/demo-site/demo-account'

// Demo content locale (tr/en only) is a separate, narrower concept from the
// platform UI locale (`Lang`/`SupportedLocale`, now 12 languages) — demo
// listings only ever ship Turkish/English copy.
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
  return {
    title: `${lang === 'tr' ? 'Hesabım' : 'My account'} | ${catalog.brand[lang]}`,
    robots: { index: false, follow: false },
  }
}

export default async function DemoAccountPage({
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
  // Only commerce demos have customer accounts.
  if (!demo || !catalog || !catalog.commerce) notFound()

  return (
    <DemoChrome slug={slug} lang={lang}>
      <DemoAccount slug={slug} lang={lang} brand={catalog.brand[lang]} />
    </DemoChrome>
  )
}
