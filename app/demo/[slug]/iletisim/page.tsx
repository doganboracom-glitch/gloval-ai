import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemo } from '@/lib/demos'
import { getCatalog } from '@/lib/demo-catalog'
import { DemoChrome } from '@/components/demo-site/demo-chrome'
import { ContactPanel } from '@/components/demo-site/contact-panel'

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
  return {
    title: lang === 'tr' ? `İletişim | ${catalog.brand[lang]}` : `Contact | ${catalog.brand[lang]}`,
    description:
      lang === 'tr'
        ? `${catalog.brand[lang]} ile telefon, WhatsApp veya e-posta ile iletişime geçin.`
        : `Get in touch with ${catalog.brand[lang]} by phone, WhatsApp or email.`,
    robots: { index: false, follow: true },
  }
}

export default async function DemoContactPage({
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
  if (!demo || !catalog) notFound()

  return (
    <DemoChrome slug={slug} lang={lang}>
      <ContactPanel contact={catalog.contact} lang={lang} brand={catalog.brand[lang]} />
    </DemoChrome>
  )
}
