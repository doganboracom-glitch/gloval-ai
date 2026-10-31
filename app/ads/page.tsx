import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdsPageClient } from '@/components/ads/ads-page-client'
import { AdsCreditsSection } from '@/components/ads/sections/ads-credits-section'
import { AdsExamplePreviewSection } from '@/components/ads/sections/ads-example-preview'
import { AdsFaqSection } from '@/components/ads/sections/ads-faq-section'
import { AdsHowItWorksSection } from '@/components/ads/sections/ads-how-it-works'
import { AdsTrustSection } from '@/components/ads/sections/ads-trust-section'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { buildPageMetadata, resolveSeoLang } from '@/lib/seo/page-seo'

type SearchParams = Promise<{ lang?: string | string[] }>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { lang } = await searchParams
  return buildPageMetadata('ads', resolveSeoLang(lang))
}

export default function AdsPage() {
  if (!isAdsFeatureUiEnabled()) notFound()
  return (
    <AdsPageClient>
      <AdsHowItWorksSection />
      <AdsExamplePreviewSection />
      <AdsCreditsSection />
      <AdsTrustSection />
      <AdsFaqSection />
    </AdsPageClient>
  )
}
