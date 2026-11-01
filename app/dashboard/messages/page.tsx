import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listOwnerContactMessages, markOwnerContactMessagesRead } from '@/lib/site-contact-store'
import { ContactMessagesClient } from '@/components/dashboard/contact-messages-client'

export const dynamic = 'force-dynamic'

export default async function ContactMessagesPage() {
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />
  if (authState.kind === 'unauthenticated') redirect('/auth/login?next=/dashboard/messages')
  const { user } = authState

  const admin = createAdminClient()
  const messages = await listOwnerContactMessages(admin, user.id).catch(() => [])
  await markOwnerContactMessagesRead(admin, user.id)
  return <ContactMessagesClient messages={messages} />
}
