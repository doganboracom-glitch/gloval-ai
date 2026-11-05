import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { SettingsClient } from '@/components/settings/settings-client'
import { isReferralCashPayoutsEnabled, isReferralFeatureEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { getReferralDashboardData, getReferralPartnerForCurrentUser } from '@/lib/referrals/partner-data'
import { getReferralPayoutPanelData } from '@/lib/referrals/payout-data'

// Auth-gated account settings must always render fresh, never from a stale
// cached session.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect('/auth/login?next=/settings')
  const { user } = authState

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const referralEnabled = isReferralFeatureEnabled()
  const payoutsEnabled = referralEnabled && isReferralPayoutsEnabled()
  const cashPayoutsEnabled = payoutsEnabled && isReferralCashPayoutsEnabled()
  const [referralPartner, payoutData, referralDashboardData] = referralEnabled
    ? await Promise.all([
        getReferralPartnerForCurrentUser(),
        payoutsEnabled ? getReferralPayoutPanelData() : Promise.resolve(null),
        getReferralDashboardData().catch(() => null),
      ])
    : [null, null, null]

  return (
    <SettingsClient
      userEmail={user.email ?? ''}
      fullName={profile?.full_name ?? ''}
      referralEnabled={referralEnabled}
      referralPartner={referralPartner}
      referralDashboardData={referralDashboardData}
      payoutsEnabled={payoutsEnabled}
      cashPayoutsEnabled={cashPayoutsEnabled}
      referralPayoutData={payoutData}
    />
  )
}
