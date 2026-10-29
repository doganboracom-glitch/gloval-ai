import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import { buildContactAckEmail, SUPPORT_SENDER_NAME } from '@/lib/email/support-mail'
import { resolveEmailLang, type EmailLang } from '@/lib/email/lang'

/**
 * "Talebiniz alındı" acknowledgement for the public /iletisim form.
 *
 * It is a small outbox on top of `notification_logs` (no schema change): one row
 * per ticket, claimed under the unique `dedupe_key` `contact_ack:<ticketId>`, so
 * a ticket can never get two acknowledgements. The row status is the delivery
 * state (`queued` -> `sent`, or `failed` while retries remain) and the row body
 * carries the guest's language and the attempt counter. The ticket is already
 * saved by the time we get here, so nothing in this file may ever make the form
 * fail; undelivered rows are retried by the email-outbox cron.
 */

export const CONTACT_ACK_TYPE = 'contact_ack'
export const CONTACT_ACK_LIMIT_PER_EMAIL = 3
export const CONTACT_ACK_WINDOW_MS = 24 * 60 * 60 * 1000
export const CONTACT_ACK_MAX_ATTEMPTS = 5
/** The cron leaves very fresh rows alone so it cannot race the immediate send. */
const CRON_MIN_AGE_MS = 2 * 60 * 1000

const UNIQUE_VIOLATION = '23505'

export const contactAckDedupeKey = (ticketId: string) => `${CONTACT_ACK_TYPE}:${ticketId}`

export function formatAckBody(lang: EmailLang, attempts: number): string {
  return `lang=${lang} attempts=${attempts}`
}

export function parseAckBody(body: string | null | undefined): { lang: EmailLang; attempts: number } {
  const lang = resolveEmailLang(/lang=([a-z-]+)/i.exec(body ?? '')?.[1])
  const attempts = Number(/attempts=(\d+)/.exec(body ?? '')?.[1] ?? 0)
  return { lang, attempts: Number.isFinite(attempts) ? attempts : 0 }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * True when this ticket is among the first `CONTACT_ACK_LIMIT_PER_EMAIL` contact
 * tickets from the same address in the last 24 hours. Ranking by creation order
 * (instead of counting acks sent) keeps the limit exact under concurrent submits
 * and independent of delivery failures. Lookup errors fail closed.
 */
export async function isWithinAckBudget(ticketId: string, email: string, now = Date.now()): Promise<boolean> {
  const since = new Date(now - CONTACT_ACK_WINDOW_MS).toISOString()
  const { data, error } = await createAdminClient()
    .from('support_tickets')
    .select('id')
    .eq('source', 'contact_form')
    .ilike('contact_email', escapeLike(email.trim()))
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(CONTACT_ACK_LIMIT_PER_EMAIL)
  if (error || !data) {
    console.log('[support] contact ack budget lookup failed:', error?.message)
    return false
  }
  return data.some((row) => row.id === ticketId)
}

export type EnqueueResult = 'queued' | 'rate_limited' | 'duplicate' | 'error'

export async function enqueueContactAck(input: {
  ticketId: string
  ticketNumber: string
  email: string
  lang: EmailLang
}): Promise<EnqueueResult> {
  if (!(await isWithinAckBudget(input.ticketId, input.email))) return 'rate_limited'

  const { error } = await createAdminClient()
    .from('notification_logs')
    .insert({
      user_id: null,
      channel: 'email',
      type: CONTACT_ACK_TYPE,
      subject: `Talebiniz alındı (${input.ticketNumber})`,
      body: formatAckBody(input.lang, 0),
      status: 'queued',
      dedupe_key: contactAckDedupeKey(input.ticketId),
    })
  if (error?.code === UNIQUE_VIOLATION) return 'duplicate'
  if (error) {
    console.log('[support] contact ack enqueue failed:', error.message)
    return 'error'
  }

  const send = async () => {
    try {
      await deliverContactAck(input.ticketId)
    } catch (err) {
      console.log('[support] contact ack immediate send failed:', err instanceof Error ? err.message : 'unknown')
    }
  }
  try {
    after(send)
  } catch {
    // Not inside a request scope; the cron sweep delivers it instead.
  }
  return 'queued'
}

export type DeliverResult = 'sent' | 'already_sent' | 'busy' | 'retry' | 'gave_up' | 'not_configured' | 'missing'

/** Sends (or retries) the acknowledgement for one ticket. Safe to call repeatedly. */
export async function deliverContactAck(ticketId: string): Promise<DeliverResult> {
  const admin = createAdminClient()
  const key = contactAckDedupeKey(ticketId)

  const { data: row } = await admin
    .from('notification_logs')
    .select('id, status, body')
    .eq('dedupe_key', key)
    .maybeSingle()
  if (!row) return 'missing'
  if (row.status === 'sent') return 'already_sent'

  const { lang, attempts } = parseAckBody(row.body)
  if (attempts >= CONTACT_ACK_MAX_ATTEMPTS) {
    await admin.from('notification_logs').update({ status: 'failed' }).eq('id', row.id)
    return 'gave_up'
  }

  // Compare-and-set on the body: only one caller wins this attempt.
  const claimedBody = formatAckBody(lang, attempts + 1)
  const { data: claimed } = await admin
    .from('notification_logs')
    .update({ status: 'queued', body: claimedBody })
    .eq('id', row.id)
    .eq('body', row.body)
    .select('id')
  if (!claimed?.length) return 'busy'

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, ticket_number, contact_name, contact_email')
    .eq('id', ticketId)
    .maybeSingle()
  const { data: first } = await admin
    .from('support_ticket_messages')
    .select('body')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!ticket?.contact_email) {
    await admin
      .from('notification_logs')
      .update({ status: 'failed', body: formatAckBody(lang, CONTACT_ACK_MAX_ATTEMPTS) })
      .eq('id', row.id)
    return 'gave_up'
  }

  const mail = buildContactAckEmail({
    lang,
    name: ticket.contact_name,
    ticketNumber: ticket.ticket_number,
    message: first?.body ?? '',
    supportEmail: SUPPORT_EMAIL,
  })

  const result = await sendTransactionalEmailDetailed({
    to: ticket.contact_email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: SUPPORT_EMAIL,
    fromDisplayName: SUPPORT_SENDER_NAME,
    idempotencyKey: `contact-ack-${ticketId}`,
  })

  if (result.ok) {
    await admin.from('notification_logs').update({ status: 'sent' }).eq('id', row.id)
    return 'sent'
  }

  if (result.reason === 'not_configured') {
    // Nothing was attempted, so do not spend an attempt.
    await admin.from('notification_logs').update({ status: 'queued', body: formatAckBody(lang, attempts) }).eq('id', row.id)
    return 'not_configured'
  }

  const permanent =
    result.reason === 'http' && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429
  await admin
    .from('notification_logs')
    .update({ status: 'failed', body: permanent ? formatAckBody(lang, CONTACT_ACK_MAX_ATTEMPTS) : claimedBody })
    .eq('id', row.id)
  return permanent ? 'gave_up' : 'retry'
}

/** Cron entry point: retries acknowledgements that are still queued or failed. */
export async function processContactAcks(options: { deadlineMs: number; limit?: number; now?: number }) {
  const now = options.now ?? Date.now()
  const { data } = await createAdminClient()
    .from('notification_logs')
    .select('dedupe_key, body')
    .eq('type', CONTACT_ACK_TYPE)
    .in('status', ['queued', 'failed'])
    .gte('created_at', new Date(now - CONTACT_ACK_WINDOW_MS).toISOString())
    .lte('created_at', new Date(now - CRON_MIN_AGE_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(options.limit ?? 25)

  const summary = { sent: 0, retry: 0, gaveUp: 0, skipped: 0 }
  for (const row of data ?? []) {
    if (Date.now() >= options.deadlineMs) break
    const ticketId = row.dedupe_key?.slice(CONTACT_ACK_TYPE.length + 1)
    if (!ticketId || parseAckBody(row.body).attempts >= CONTACT_ACK_MAX_ATTEMPTS) {
      summary.skipped++
      continue
    }
    const outcome = await deliverContactAck(ticketId)
    if (outcome === 'sent') summary.sent++
    else if (outcome === 'retry') summary.retry++
    else if (outcome === 'gave_up') summary.gaveUp++
    else summary.skipped++
  }
  return summary
}
