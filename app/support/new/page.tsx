import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMyProjects } from '@/lib/support/queries'
import { newTicketSignUpHref, parseTicketPrefill } from '@/lib/support/prefill'
import { NewTicketForm } from '@/components/support/new-ticket-form'

export const dynamic = 'force-dynamic'

export default async function NewSupportTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(newTicketSignUpHref(params))
  const projects = await listMyProjects(user.id)
  const prefill = parseTicketPrefill(
    params,
    projects.map((p) => p.id),
  )
  return <NewTicketForm projects={projects} prefill={prefill} />
}
