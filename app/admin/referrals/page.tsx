import { notFound } from 'next/navigation'
import { ReferralPartnersAdminView } from '@/components/admin/referral-partners-admin-view'
import { isReferralFeatureEnabled } from '@/lib/referrals/core'
import { getReferralAdminSummary } from '@/lib/referrals/partner-data'

export const dynamic = 'force-dynamic'

export default async function AdminReferralsPage() {
  if (!isReferralFeatureEnabled()) notFound()

  const partners = await getReferralAdminSummary()
  return <ReferralPartnersAdminView partners={partners ?? []} unavailable={partners === null} />
}
