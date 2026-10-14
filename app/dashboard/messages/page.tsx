import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listOwnerContactMessages, markOwnerContactMessagesRead } from '@/lib/site-contact-store'
import { ContactMessagesClient } from '@/components/dashboard/contact-messages-client'

export const dynamic = 'force-dynamic'

export default async function ContactMessagesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/dashboard/messages')

  const admin = createAdminClient()
  const messages = await listOwnerContactMessages(admin, user.id).catch(() => [])
  await markOwnerContactMessagesRead(admin, user.id)
  return <ContactMessagesClient messages={messages} />
}
