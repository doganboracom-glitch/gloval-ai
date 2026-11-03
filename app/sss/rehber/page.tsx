import type { Metadata } from 'next'
import { GuideIndexPage } from '@/components/content/guide-index-page'
import { buildGuideIndexMetadata } from '@/lib/seo/guide-seo'
import { resolveSeoLang } from '@/lib/seo/page-seo'

type GuideIndexRouteProps = {
  searchParams: Promise<{ lang?: string | string[] }>
}

export async function generateMetadata({ searchParams }: GuideIndexRouteProps): Promise<Metadata> {
  const { lang } = await searchParams
  return buildGuideIndexMetadata(resolveSeoLang(lang))
}

export default async function GuideIndexRoute({ searchParams }: GuideIndexRouteProps) {
  const { lang } = await searchParams
  return <GuideIndexPage locale={resolveSeoLang(lang)} />
}
