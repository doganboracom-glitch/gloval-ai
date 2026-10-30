import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdsPageClient } from '@/components/ads/ads-page-client'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

type SearchParams = Promise<{ lang?: string | string[] }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('ads', resolveSeoLang(lang))
}

export default function AdsPage() {
  if (!isAdsFeatureUiEnabled()) notFound()
  return <AdsPageClient />
}
