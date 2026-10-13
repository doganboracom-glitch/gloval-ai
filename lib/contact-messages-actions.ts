'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteOwnerContactMessage } from '@/lib/site-contact-store'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deletes one contact-form message; the store only matches the caller's own projects. */
export async function deleteContactMessageAction(messageId: string): Promise<{ ok: boolean }> {
  if (typeof messageId !== 'string' || !UUID.test(messageId)) return { ok: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const ok = await deleteOwnerContactMessage(createAdminClient(), user.id, messageId)
  if (ok) revalidatePath('/dashboard/messages')
  return { ok }
}
