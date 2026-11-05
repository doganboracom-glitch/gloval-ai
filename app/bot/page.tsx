import type { Metadata } from 'next'
import { BotPageClient } from '@/components/bot/bot-page-client'
import { SUPPORT_EMAIL } from '@/lib/notify'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

/** The page the GlovalAdsBot user agent links to (`lib/ads/scan/config.ts`). */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>
}): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('bot', resolveSeoLang(lang))
}

export default function BotPage() {
  return <BotPageClient supportEmail={SUPPORT_EMAIL} />
}
