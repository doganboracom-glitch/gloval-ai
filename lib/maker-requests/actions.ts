'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { buildMakerRequestReplyEmail } from '@/lib/email/maker-request-mail'
import { sendTransactionalEmailDetailed } from '@/lib/notify'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailLang } from '@/lib/email/lang'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_NOTE_LENGTH = 5000
const MAX_REPLY_LENGTH = 5000

export type MakerRequestActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'email_unavailable' | 'email_failed' | 'save_failed' }

function validId(id: string) {
  return UUID_PATTERN.test(id)
}

function revalidateRequestPages(id: string) {
  revalidatePath('/admin/maker-requests')
  revalidatePath(`/admin/maker-requests/${id}`)
}

export async function saveMakerRequestNotes(
  id: string,
  value: string,
): Promise<MakerRequestActionResult> {
  await requireAdmin()
  const notes = typeof value === 'string' ? value.trim() : ''
  if (!validId(id) || notes.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'invalid_input' }
  }

  const { error } = await createAdminClient()
    .from('maker_requests')
    .update({ admin_notes: notes })
    .eq('id', id)

  if (error) return { ok: false, error: 'save_failed' }
  revalidateRequestPages(id)
  return { ok: true }
}

export async function closeMakerRequest(id: string): Promise<MakerRequestActionResult> {
  await requireAdmin()
  if (!validId(id)) return { ok: false, error: 'invalid_input' }

  const { error } = await createAdminClient()
    .from('maker_requests')
    .update({ status: 'closed' })
    .eq('id', id)

  if (error) return { ok: false, error: 'save_failed' }
  revalidateRequestPages(id)
  return { ok: true }
}

export async function sendMakerRequestReply(
  id: string,
  value: string,
  lang: EmailLang,
): Promise<MakerRequestActionResult> {
  await requireAdmin()
  const reply = typeof value === 'string' ? value.trim() : ''
  if (!validId(id) || !reply || reply.length > MAX_REPLY_LENGTH) {
    return { ok: false, error: 'invalid_input' }
  }

  const admin = createAdminClient()
  const { data: request, error: readError } = await admin
    .from('maker_requests')
    .select('id, full_name, email')
    .eq('id', id)
    .maybeSingle()

  if (readError) return { ok: false, error: 'save_failed' }
  if (!request) return { ok: false, error: 'not_found' }

  const email = buildMakerRequestReplyEmail({
    lang: lang === 'tr' ? 'tr' : 'en',
    fullName: request.full_name,
    reply,
  })
  const replyDigest = createHash('sha256').update(reply).digest('hex').slice(0, 24)
  const delivery = await sendTransactionalEmailDetailed({
    to: request.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromDisplayName: 'GLOVAL AI',
    replyTo: process.env.ADMIN_NOTIFICATION_EMAIL?.split(',')[0]?.trim() || undefined,
    idempotencyKey: `maker-request-reply-${id}-${replyDigest}`,
  })

  if (!delivery.ok) {
    return {
      ok: false,
      error: delivery.reason === 'not_configured' ? 'email_unavailable' : 'email_failed',
    }
  }

  const { error: updateError } = await admin
    .from('maker_requests')
    .update({
      reply_text: reply,
      replied_at: new Date().toISOString(),
      status: 'answered',
    })
    .eq('id', id)

  if (updateError) return { ok: false, error: 'save_failed' }
  revalidateRequestPages(id)
  return { ok: true }
}
