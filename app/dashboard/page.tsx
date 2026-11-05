import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { listProjects } from '@/lib/projects'
import { getMyCurrentPlan, getMySubscription } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { AURA_CURSOR_CODE } from '@/lib/billing-utils'
import { isAuraCursorFeatureUiEnabled } from '@/lib/aura-cursor-feature-flag'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { CreditNoticeToast } from '@/components/credit-notice-toast'
import { getMyBillingProfileStatusAction } from '@/lib/billing-profile-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWithinWelcomeWindow, scheduleWelcomeEmail } from '@/lib/email-outbox'
import { countOwnerUnreadContactMessages } from '@/lib/site-contact-store'
import { isReferralFeatureEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { getReferralDashboardData, getReferralPartnerForCurrentUser } from '@/lib/referrals/partner-data'
import { getReferralPayoutPanelData } from '@/lib/referrals/payout-data'
import { nonCritical, withOneRetry } from '@/lib/dashboard-resilience'

// The dashboard is per-user, auth-gated data that must never be served from a
// stale full-route cache — always render it dynamically so a project created
// moments earlier (e.g. right after login) is always present.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect('/auth/login?next=/dashboard')
  const { user } = authState
  // Never serve the dashboard to an unverified account, even if the request
  // somehow reaches the page directly. Uses the real Supabase confirmation
  // state rather than any client-side flag.
  if (!user.email_confirmed_at) {
    redirect(`/auth/verify-email?email=${encodeURIComponent(user.email ?? '')}`)
  }

  // Safety net for a missed trigger/session hook: only accounts inside the
  // 24-hour welcome window can be affected, so older users cost no query.
  if (isWithinWelcomeWindow(user.created_at)) scheduleWelcomeEmail(user)

  // Only the projects list is critical (one retry for transient blips); the
  // unread counter and Aura rights fall back to empty values so a failure in
  // either can never take the whole panel down.
  const referralEnabled = isReferralFeatureEnabled()
  const payoutsEnabled = referralEnabled && isReferralPayoutsEnabled()
  const [projects, unreadMessages, auraSiteIds, referralDashboard, referralPartner, referralPayoutData] = await Promise.all([
    withOneRetry('listProjects', () => listProjects()),
    nonCritical(
      'unreadMessages',
      () => countOwnerUnreadContactMessages(createAdminClient(), user.id),
      0,
    ),
    // Sites holding an active Aura İmleç right get the settings button. RLS
    // limits this read to the caller's own rights; a failure just hides the button.
    nonCritical(
      'auraRights',
      async () => {
        const { data, error } = await supabase
          .from('project_entitlements')
          .select('project_id')
          .eq('user_id', user.id)
          .eq('code', AURA_CURSOR_CODE)
          .eq('status', 'active')
        if (error) throw error
        return (data ?? []).map((row) => row.project_id as string)
      },
      [] as string[],
    ),
    referralEnabled
      ? nonCritical('referralDashboard', () => getReferralDashboardData(), null)
      : Promise.resolve(null),
    referralEnabled
      ? nonCritical('referralPartner', () => getReferralPartnerForCurrentUser(), null)
      : Promise.resolve(null),
    payoutsEnabled
      ? nonCritical('referralPayouts', () => getReferralPayoutPanelData(), null)
      : Promise.resolve(null),
  ])
  // Aktif abonelik yoksa kullanıcı FREE sayılır. Faturalama sorgusu panelin
  // açılmasını engellememeli, bu yüzden hata durumunda güvenli tarafa düşer.
  const currentPlan = await getMyCurrentPlan().catch(() => null)
  const subscription = await getMySubscription().catch(() => null)
  const billingAlert =
    subscription?.status === 'past_due' || subscription?.status === 'suspended'
      ? subscription.status
      : null
  const billingProfileStatus = await getMyBillingProfileStatusAction().catch(() => ({
    available: false,
    complete: false,
  }))
  const showBillingProfileReminder =
    subscription?.status === 'active' &&
    (currentPlan?.price_cents ?? 0) > 0 &&
    billingProfileStatus.available &&
    !billingProfileStatus.complete

  return (
    <>
      <CreditNoticeToast />
      <DashboardClient
        projects={projects}
        auraSiteIds={auraSiteIds}
        auraSellingEnabled={isAuraCursorFeatureUiEnabled()}
        userEmail={user.email ?? ''}
        unreadMessages={unreadMessages}
        referralDashboard={referralDashboard}
        referralPayoutData={referralPayoutData}
        referralEnabled={referralEnabled}
        hasReferralPartner={Boolean(referralPartner)}
        payoutsEnabled={payoutsEnabled}
        planCode={toPlanCode(currentPlan?.code)}
        billingAlert={billingAlert}
        showBillingProfileReminder={showBillingProfileReminder}
      />
    </>
  )
}
