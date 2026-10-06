import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyTicket } from '@/lib/support/queries'
import { TicketThread } from '@/components/support/ticket-thread'

export const dynamic = 'force-dynamic'

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/support/${id}`)
  const ticket = await getMyTicket(id)
  if (!ticket) notFound()
  return <TicketThread ticket={ticket} />
}
