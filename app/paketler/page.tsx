import type { Metadata } from 'next'
import { PaketlerCampaignLanding } from '@/components/paketler-campaign-landing'

export const metadata: Metadata = {
  title: 'GLOVAL AI Paketleri',
  description:
    'GLOVAL AI paketlerinin güncel aylık ve yıllık fiyatlarını, site limitlerini ve öne çıkan özelliklerini karşılaştırın.',
  robots: { index: false, follow: false },
}

export default function PaketlerPage() {
  return <PaketlerCampaignLanding />
}
