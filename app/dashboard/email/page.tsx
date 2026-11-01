import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { getMyMailOverview } from '@/lib/mail'
import { EmailClient } from '@/components/mail/email-client'

// Per-user mail state must never be served stale: a mailbox created seconds
// ago has to show up on the next render.
export const dynamic = 'force-dynamic'

export default async function EmailPage() {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect('/auth/login?next=/dashboard/email')
  const { user } = authState

  const overview = await getMyMailOverview()

  return <EmailClient overview={overview} userEmail={user.email ?? ''} />
}
