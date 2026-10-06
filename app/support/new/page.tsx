import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMyProjects } from '@/lib/support/queries'
import { NewTicketForm } from '@/components/support/new-ticket-form'

export const dynamic = 'force-dynamic'

export default async function NewSupportTicketPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/support/new')
  const projects = await listMyProjects(user.id)
  return <NewTicketForm projects={projects} />
}
