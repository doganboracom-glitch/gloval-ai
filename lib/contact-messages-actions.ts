'use server'

import { revalidatePath } from 'next/cache'
import { getRequestUser, authUnavailableActionResult } from '@/lib/supabase/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteOwnerContactMessage } from '@/lib/site-contact-store'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deletes one contact-form message; the store only matches the caller's own projects. */
export type DeleteContactMessageResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_message' | 'unauthenticated' | 'auth_unavailable' }

export async function deleteContactMessageAction(messageId: string): Promise<DeleteContactMessageResult> {
  if (typeof messageId !== 'string' || !UUID.test(messageId)) return { ok: false, reason: 'invalid_message' }
  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') return authUnavailableActionResult()
  if (authState.kind === 'unauthenticated') return { ok: false, reason: 'unauthenticated' }

  const ok = await deleteOwnerContactMessage(createAdminClient(), authState.user.id, messageId)
  if (ok) revalidatePath('/dashboard/messages')
  return { ok }
}
