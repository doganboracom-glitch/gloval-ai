import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

// The dashboard is per-user, auth-gated data that must never be served from a
// stale full-route cache — always render it dynamically so a project created
// moments earlier (e.g. right after login) is always present.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard')
  // Never serve the dashboard to an unverified account, even if the request
  // somehow reaches the page directly. Uses the real Supabase confirmation
  // state rather than any client-side flag.
  if (!user.email_confirmed_at) {
    redirect(`/auth/verify-email?email=${encodeURIComponent(user.email ?? '')}`)
  }

  // Safety net for a missed trigger/session hook: only accounts inside the
  // 24-hour welcome window can be affected, so older users cost no query.
  if (isWithinWelcomeWindow(user.created_at)) scheduleWelcomeEmail(user)

  const [projects, unreadMessages] = await Promise.all([
    listProjects(),
    countOwnerUnreadContactMessages(createAdminClient(), user.id),
  ])
  // Sites holding an active Aura İmleç right get the settings button. RLS
  // limits this read to the caller's own rights; a failure just hides the button.
  const { data: auraRights } = await supabase
    .from('project_entitlements')
    .select('project_id')
    .eq('user_id', user.id)
    .eq('code', AURA_CURSOR_CODE)
    .eq('status', 'active')
  const auraSiteIds = (auraRights ?? []).map((row) => row.project_id as string)
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
        planCode={toPlanCode(currentPlan?.code)}
        billingAlert={billingAlert}
        showBillingProfileReminder={showBillingProfileReminder}
      />
    </>
  )
}
