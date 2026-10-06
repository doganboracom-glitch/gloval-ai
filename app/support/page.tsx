import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMyTickets } from '@/lib/support/queries'
import { SupportList } from '@/components/support/support-list'

export const dynamic = 'force-dynamic'

export default async function SupportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/support')
  const tickets = await listMyTickets()
  return <SupportList tickets={tickets} />
}
