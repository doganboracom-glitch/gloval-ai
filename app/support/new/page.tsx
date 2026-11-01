import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
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
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect(newTicketSignUpHref(params))
  const { user } = authState
  const projects = await listMyProjects(user.id)
  const prefill = parseTicketPrefill(
    params,
    projects.map((p) => p.id),
  )
  return <NewTicketForm projects={projects} prefill={prefill} />
}
