import type { Metadata } from 'next'
import { DbAjansCampaignLanding } from '@/components/dbajans-campaign-landing'

export const metadata: Metadata = {
  title: 'DB AJANS için GLOVAL AI',
  description: 'GLOVAL AI ile web sitenizi yapay zekâyla hazırlayın, satın almadan önce görün ve karar verin.',
  robots: { index: false, follow: false },
}

export default function DbAjansPage() {
  return <DbAjansCampaignLanding />
}
