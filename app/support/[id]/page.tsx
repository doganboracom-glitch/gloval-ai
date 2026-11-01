import { notFound, redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { getMyTicket } from '@/lib/support/queries'
import { TicketThread } from '@/components/support/ticket-thread'

export const dynamic = 'force-dynamic'

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect(`/auth/login?next=/support/${id}`)
  const { user } = authState
  const ticket = await getMyTicket(id)
  if (!ticket) notFound()
  return <TicketThread ticket={ticket} />
}
