import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { SettingsClient } from '@/components/settings/settings-client'

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

  return <SettingsClient userEmail={user.email ?? ''} fullName={profile?.full_name ?? ''} />
}
