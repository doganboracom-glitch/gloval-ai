'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { recordNotification, sendTransactionalEmail } from '@/lib/notify'
import { COMPANY } from '@/lib/legal/company'

/**
 * Public contact form → support ticket.
 *
 * The /iletisim form is reachable by anyone (logged in or not), so this action
 * is intentionally unauthenticated. It writes through the service-role client
 * because an anonymous visitor has no RLS identity; all trust therefore comes
 * from server-side validation here, never from the caller.
 *
 * Each submission becomes a `support_tickets` row (source='contact_form',
 * user_id NULL, sender captured in contact_name/contact_email) plus the opening
 * `support_ticket_messages` row, so it shows up in the admin "Destek" panel
 * exactly like an in-app ticket. We also drop an admin notification and, when
 * configured, email the operator — every step is best-effort and never blocks
 * the user's confirmation.
 */

export type ContactResult = { ok: true } | { ok: false; error: string }

const MAX_NAME = 120
const MAX_EMAIL = 200
const MAX_MESSAGE = 4000

function isValidEmail(value: string): boolean {
  // Deliberately permissive: reject only the obviously malformed.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function submitContactRequest(input: {
  name: string
  email: string
  message: string
}): Promise<ContactResult> {
  const name = input.name?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  const message = input.message?.trim() ?? ''

  if (name.length < 2 || name.length > MAX_NAME) return { ok: false, error: 'invalid_name' }
  if (!email || email.length > MAX_EMAIL || !isValidEmail(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  if (message.length < 10 || message.length > MAX_MESSAGE) {
    return { ok: false, error: 'invalid_message' }
  }

  const admin = createAdminClient()

  const subject = `İletişim formu: ${name}`

  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .insert({
      user_id: null,
      subject,
      status: 'open',
      priority: 'normal',
      source: 'contact_form',
      contact_name: name,
      contact_email: email,
    })
    .select('id')
    .single()

  if (ticketError || !ticket) {
    console.log('[v0] contact ticket insert failed:', ticketError)
    return { ok: false, error: 'insert_failed' }
  }

  const { error: msgError } = await admin.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    author_type: 'user',
    author_email: email,
    body: message,
  })

  if (msgError) {
    console.log('[v0] contact message insert failed:', msgError)
    // The ticket exists; the admin can still see the sender/subject, so treat
    // this as a soft success rather than losing the lead entirely.
  }

  // Surface the request in the admin "Bildirimler" screen.
  await recordNotification({
    userId: null,
    channel: 'system',
    type: 'contact_request',
    subject,
    body: `${name} <${email}>\n\n${message}`,
    status: 'sent',
  })

  // Best-effort heads-up to the operator inbox.
  const adminEmail =
    process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || COMPANY.supportEmail
  if (adminEmail && !adminEmail.startsWith('[')) {
    await sendTransactionalEmail({
      to: adminEmail,
      replyTo: email,
      subject: `[Gloval AI] Yeni iletişim talebi — ${name}`,
      text: `Ad: ${name}\nE-posta: ${email}\n\n${message}`,
      html: `<p><strong>Ad:</strong> ${name}</p><p><strong>E-posta:</strong> ${email}</p><p style="white-space:pre-wrap">${message}</p>`,
    })
  }

  return { ok: true }
}
