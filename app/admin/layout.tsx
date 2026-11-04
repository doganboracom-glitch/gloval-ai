import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { isReferralFeatureEnabled } from '@/lib/referrals/core'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminUnauthorized } from '@/components/admin/admin-unauthorized'

// Admin state is per-request and permission-sensitive; never cache it.
export const dynamic = 'force-dynamic'

/**
 * Gate for the whole admin area.
 *
 * The route ALWAYS exists — a 404 here would (and previously did) make an
 * unauthorized visitor look like a missing page. Instead:
 *   - signed-out  → redirect to login, returning to /admin afterwards
 *   - signed-in, not on the ADMIN_EMAILS allowlist → 403-style unauthorized UI
 *   - admin       → the full admin shell
 *
 * The layout gates before children render, so no nested admin page executes
 * for a non-admin (the page element is only rendered when included below).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') {
    redirect('/auth/login?next=/admin')
  }
  const { user } = authState

  const admin = isAdminEmail(user.email)

  if (!admin) {
    return <AdminUnauthorized email={user.email ?? undefined} />
  }

  return (
    <AdminShell adminEmail={user.email ?? ''} referralsEnabled={isReferralFeatureEnabled()}>
      {children}
    </AdminShell>
  )
}
