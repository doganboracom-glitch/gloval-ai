import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_EMAIL, sendTransactionalEmailDetailed } from '@/lib/notify'
import { buildTicketReplyEmail, SUPPORT_SENDER_NAME, type SupportMail } from '@/lib/email/support-mail'
import { resolveEmailLang, type EmailLang } from '@/lib/email/lang'
import { contactAckDedupeKey, parseAckBody } from '@/lib/support/contact-ack'

export type ReplyTicket = {
  id: string
  user_id: string | null
  subject: string
  ticket_number: string
  contact_email: string | null
  contact_name: string | null
}

export type ReplyRecipient = {
  to: string
  audience: 'guest' | 'account'
  lang: EmailLang
  name: string | null
}

type OwnerLookup = (userId: string) => Promise<{ email: string | null; metadata: Record<string, unknown> } | null>

async function lookupOwner(userId: string): Promise<{ email: string | null; metadata: Record<string, unknown> } | null> {
  const {
    data: { user },
  } = await createAdminClient().auth.admin.getUserById(userId)
  if (!user) return null
  return { email: user.email ?? null, metadata: (user.user_metadata ?? {}) as Record<string, unknown> }
}

/**
 * Decides on the server whether the ticket belongs to a real account. Only a
 * ticket whose owner still resolves to a user with an email gets the account
 * variant (dashboard link); everything else, including contact-form tickets,
 * is written to the address the visitor gave us and never mentions a dashboard.
 */
export async function resolveReplyRecipient(
  ticket: ReplyTicket,
  deps: { lookupOwner?: OwnerLookup; guestLang?: (ticketId: string) => Promise<EmailLang> } = {},
): Promise<ReplyRecipient | null> {
  if (ticket.user_id) {
    const owner = await (deps.lookupOwner ?? lookupOwner)(ticket.user_id)
    if (owner?.email) {
      const meta = owner.metadata
      const name =
        (typeof meta.full_name === 'string' && meta.full_name) || (typeof meta.name === 'string' && meta.name) || null
      return { to: owner.email, audience: 'account', lang: resolveEmailLang(meta.email_locale), name }
    }
  }
  if (!ticket.contact_email) return null
  const lang = await (deps.guestLang ?? guestLangFor)(ticket.id)
  return { to: ticket.contact_email, audience: 'guest', lang, name: ticket.contact_name }
}

/** The visitor's form language is remembered on the acknowledgement row. */
async function guestLangFor(ticketId: string): Promise<EmailLang> {
  const { data } = await createAdminClient()
    .from('notification_logs')
    .select('body')
    .eq('dedupe_key', contactAckDedupeKey(ticketId))
    .maybeSingle()
  return parseAckBody(data?.body).lang
}

export async function buildReplyForTicket(
  ticket: ReplyTicket,
  replyBody: string,
  deps?: Parameters<typeof resolveReplyRecipient>[1],
): Promise<{ recipient: ReplyRecipient; mail: SupportMail } | null> {
  const recipient = await resolveReplyRecipient(ticket, deps)
  if (!recipient) return null
  const mail = buildTicketReplyEmail({
    lang: recipient.lang,
    audience: recipient.audience,
    name: recipient.name,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    ticketSubject: ticket.subject,
    replyBody,
  })
  return { recipient, mail }
}

/** Emails an admin reply to the ticket owner. Returns the subject used and whether it was sent. */
export async function sendTicketReplyEmail(
  ticket: ReplyTicket,
  replyBody: string,
): Promise<{ subject: string; sent: boolean }> {
  const built = await buildReplyForTicket(ticket, replyBody)
  if (!built) return { subject: `Talebinize yanıt verildi (${ticket.ticket_number}) | GLOVAL AI`, sent: false }
  const result = await sendTransactionalEmailDetailed({
    to: built.recipient.to,
    subject: built.mail.subject,
    html: built.mail.html,
    text: built.mail.text,
    replyTo: SUPPORT_EMAIL,
    fromDisplayName: SUPPORT_SENDER_NAME,
  })
  return { subject: built.mail.subject, sent: result.ok }
}
