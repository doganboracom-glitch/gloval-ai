import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { listMyTickets } from '@/lib/support/queries'
import { SupportList } from '@/components/support/support-list'

export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect('/auth/login?next=/support')
  const { user } = authState
  const tickets = await listMyTickets()
  return <SupportList tickets={tickets} />
}
