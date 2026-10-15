import type { Metadata } from 'next'
import { ContactPageClient } from '@/components/legal/contact-page-client'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('contact', resolveSeoLang(lang))
}

export default function ContactPage() {
  return <ContactPageClient />
}
