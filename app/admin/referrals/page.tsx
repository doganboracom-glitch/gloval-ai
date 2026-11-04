import { notFound } from 'next/navigation'
import { ReferralPartnersAdminView } from '@/components/admin/referral-partners-admin-view'
import { isReferralFeatureEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { getReferralAdminSummary } from '@/lib/referrals/partner-data'
import {
  getReferralCommissionAdminRows,
  getReferralPayoutAdminRequests,
  getReferralPayoutAdminSummary,
} from '@/lib/referrals/payout-data'

export const dynamic = 'force-dynamic'

export default async function AdminReferralsPage() {
  if (!isReferralFeatureEnabled()) notFound()

  const payoutsEnabled = isReferralPayoutsEnabled()
  const [partners, payoutRequests, payoutSummary, commissionRows] = await Promise.all([
    getReferralAdminSummary(),
    payoutsEnabled ? getReferralPayoutAdminRequests() : Promise.resolve(null),
    payoutsEnabled ? getReferralPayoutAdminSummary() : Promise.resolve(null),
    payoutsEnabled ? getReferralCommissionAdminRows() : Promise.resolve(null),
  ])
  return (
    <ReferralPartnersAdminView
      partners={partners ?? []}
      unavailable={partners === null}
      payoutsEnabled={payoutsEnabled}
      payoutRequests={payoutRequests ?? []}
      payoutSummary={payoutSummary}
      payoutsUnavailable={payoutsEnabled && (payoutRequests === null || payoutSummary === null)}
      commissionRows={commissionRows ?? []}
      commissionsUnavailable={payoutsEnabled && commissionRows === null}
    />
  )
}
