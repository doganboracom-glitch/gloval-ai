import { AdsCreditsSection } from '@/components/ads/sections/ads-credits-section'
import { AdsExamplePreviewSection } from '@/components/ads/sections/ads-example-preview'
import { AdsFaqSection } from '@/components/ads/sections/ads-faq-section'
import { AdsHowItWorksSection } from '@/components/ads/sections/ads-how-it-works'
import { AdsTrustSection } from '@/components/ads/sections/ads-trust-section'
import { AdsPageClient } from '@/components/ads/ads-page-client'

export default function AdsSectionsPreviewPage() {
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
