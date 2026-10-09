import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNotification, sendTransactionalEmail } from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { getMailServerHost, getWebmailUrl } from './webmail'
import { mailSetupSubject, renderMailSetupHtml, renderMailSetupText } from './setup-email'
import type { Mailbox } from './types'

const TYPE = 'mailbox_setup'
const enabled = () => process.env.MAIL_SETUP_EMAIL_ENABLED?.trim().toLowerCase() !== 'false'

async function sendSetupEmail(input: { userId: string; recipient: string; mailbox: Mailbox; lang: string; dedupeKey: string; subject: string }) {
  if (!enabled()) return
  const claimed = await claimNotification({ userId: input.userId, type: TYPE, subject: input.subject, body: null, dedupeKey: input.dedupeKey })
  if (!claimed) return
  const host = getMailServerHost(); const webmail = getWebmailUrl()
  await sendTransactionalEmail({ to: input.recipient, subject: input.subject, text: renderMailSetupText(input.lang, input.mailbox.address, webmail, host), html: renderMailSetupHtml(input.lang, input.mailbox.address, webmail, host) })
}

/** `lang` must already be resolved in the request (see `resolveSetupEmailLang`); `after()` cannot read cookies. */
export function queueMailboxSetupEmail(input: { userId: string; accountEmail: string; mailbox: Mailbox; domainVerified: boolean; lang: string }) {
  const lang = resolveEmailLang(input.lang)
  const subject = mailSetupSubject(lang, input.mailbox.address)
  after(async () => {
    try {
      await sendSetupEmail({ userId: input.userId, recipient: input.accountEmail, mailbox: input.mailbox, lang, dedupeKey: `mailbox-setup:${input.mailbox.id}:account`, subject })
      if (input.domainVerified && input.mailbox.address.toLowerCase() !== input.accountEmail.toLowerCase()) await sendSetupEmail({ userId: input.userId, recipient: input.mailbox.address, mailbox: input.mailbox, lang, dedupeKey: `mailbox-setup:${input.mailbox.id}:mailbox`, subject })
    } catch { console.log('[v0] mailbox setup notification failed') }
  })
}

export async function resendMailboxSetupEmail(input: { userId: string; accountEmail: string; mailbox: Mailbox; lang: string }) {
  if (!enabled()) return { ok: false as const, error: 'DISABLED' as const }
  const admin = createAdminClient(); const since = new Date(Date.now() - 3600000).toISOString()
  const { count, error } = await admin.from('notification_logs').select('id', { count: 'exact', head: true }).eq('user_id', input.userId).eq('type', 'mailbox_setup_resend').gte('created_at', since)
  if (error || (count ?? 0) >= 3) return { ok: false as const, error: 'RATE_LIMIT' as const }
  await admin.from('notification_logs').insert({ user_id: input.userId, channel: 'system', type: 'mailbox_setup_resend', subject: 'mailbox setup resend', status: 'sent' })
  const host = getMailServerHost(); const webmail = getWebmailUrl(); const lang = resolveEmailLang(input.lang)
  const sent = await sendTransactionalEmail({ to: input.accountEmail, subject: mailSetupSubject(lang, input.mailbox.address, 'resend'), text: renderMailSetupText(lang, input.mailbox.address, webmail, host), html: renderMailSetupHtml(lang, input.mailbox.address, webmail, host) })
  return sent ? { ok: true as const } : { ok: false as const, error: 'SEND_FAILED' as const }
}
