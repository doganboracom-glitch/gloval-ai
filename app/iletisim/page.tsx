import type { Metadata } from 'next'
import { ContactPageClient } from '@/components/legal/contact-page-client'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'
import { sanitizeContactPrefillMessage } from '@/lib/contact-prefill'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('contact', resolveSeoLang(lang))
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { message } = await searchParams
  const initialMessage = sanitizeContactPrefillMessage(message)

  return <ContactPageClient initialMessage={initialMessage} />
}
