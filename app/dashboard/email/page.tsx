import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyMailOverview } from '@/lib/mail'
import { EmailClient } from '@/components/mail/email-client'

// Per-user mail state must never be served stale: a mailbox created seconds
// ago has to show up on the next render.
export const dynamic = 'force-dynamic'

export default async function EmailPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard/email')

  const overview = await getMyMailOverview()

  return <EmailClient overview={overview} userEmail={user.email ?? ''} />
}
