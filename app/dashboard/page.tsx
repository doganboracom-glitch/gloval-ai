import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listProjects } from '@/lib/projects'
import { getMyCurrentPlan, getMySubscription } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { DashboardClient } from '@/components/dashboard/dashboard-client'

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

  const projects = await listProjects()
  // Aktif abonelik yoksa kullanıcı FREE sayılır. Faturalama sorgusu panelin
  // açılmasını engellememeli, bu yüzden hata durumunda güvenli tarafa düşer.
  const currentPlan = await getMyCurrentPlan().catch(() => null)
  const subscription = await getMySubscription().catch(() => null)
  const billingAlert =
    subscription?.status === 'past_due' || subscription?.status === 'suspended'
      ? subscription.status
      : null

  return (
    <DashboardClient
      projects={projects}
      userEmail={user.email ?? ''}
      planCode={toPlanCode(currentPlan?.code)}
      billingAlert={billingAlert}
    />
  )
}
