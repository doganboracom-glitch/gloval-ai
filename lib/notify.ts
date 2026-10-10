import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeStoreFrom } from '@/lib/email/from'
import { appendBillingProfileReminder } from '@/lib/billing-profile-copy'
import { getBillingProfileStatusForUser } from '@/lib/billing-profile-store'

/**
 * Platform notification layer.
 *
 * Two responsibilities, deliberately kept together so callers have ONE place to
 * reach for "tell someone something happened":
 *
 *  1. `sendTransactionalEmail` — fire a real email through Resend (uses
 *     `RESEND_API_KEY` + `MAIL_FROM`). This is separate from the corporate
 *     mailbox system in `lib/mail/*` (which is a provisioning mock); this module
 *     is the platform's own outbound transactional mail.
 *  2. `recordNotification` — append a row to `notification_logs`, which is what
 *     the admin "Bildirimler" screen reads. Writing here == surfacing an event
 *     in the admin panel.
 *
 * Everything here is BEST-EFFORT: a failed email or a failed log must never
 * break the business action that triggered it. Callers get a boolean/void and
 * carry on.
 */

/** Support address shown to end users on account/billing notices. */
export const SUPPORT_EMAIL = 'support@gloval.ai'

/**
 * Short, user-facing ticket number for a payment/subscription event, e.g.
 * `GLV-8F4K2M`. Deterministically derived from the real provider/transaction
 * reference (a UUID) via a one-way hash, so:
 *  - the same transaction always produces the same ticket (a resent email
 *    shows an identical number the user can quote again), and
 *  - the raw UUID is never exposed to the end user.
 * The real reference stays in `billing_transactions.provider_ref` /
 * `billing_subscriptions.provider_ref` untouched — this is a display-only
 * derivative, never used to look up records.
 */
export function formatTicketNumber(ref: string): string {
  const hash = createHash('sha256').update(ref).digest('hex')
  const short = BigInt(`0x${hash.slice(0, 12)}`)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0')
    .slice(-6)
  return `GLV-${short}`
}

type NotificationChannel = 'email' | 'system'
type NotificationStatus = 'sent' | 'queued' | 'failed'

/**
 * Send a transactional email via Resend's REST API. Returns true on a 2xx.
 * No-ops (returns false) when the API key, from address or recipient is missing
 * so local/dev environments degrade gracefully instead of throwing.
 */
export async function sendTransactionalEmail(input: {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  /** Store name shown as "<name> via GLOVAL AI"; the address stays MAIL_FROM. */
  fromName?: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const mailFrom = process.env.MAIL_FROM?.trim()
  const from =
    mailFrom && input.fromName ? composeStoreFrom(mailFrom, input.fromName) : mailFrom
  const to = input.to?.trim()

  if (!apiKey || !from || !to) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    })
    if (!res.ok) {
      console.log('[v0] resend send failed:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (error) {
    console.log('[v0] resend send error:', error)
    return false
  }
}

/**
 * Append an entry to `notification_logs`. Swallows errors — a logging failure
 * must never surface to the user or abort the triggering action.
 */
export async function recordNotification(input: {
  userId: string | null
  channel: NotificationChannel
  type: string
  subject: string
  body?: string | null
  status?: NotificationStatus
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('notification_logs').insert({
      user_id: input.userId,
      channel: input.channel,
      type: input.type,
      subject: input.subject,
      body: input.body ?? null,
      status: input.status ?? 'sent',
    })
  } catch (error) {
    console.log('[v0] notification log failed:', error)
  }
}

const UNIQUE_VIOLATION = '23505'

/**
 * Atomically claims a once-only notification by inserting its log row under a
 * unique `dedupe_key`. Returns false ONLY when that key was already claimed.
 * Any other logging failure fails open (true) so a broken log table can never
 * swallow a payment notice.
 */
export async function claimNotification(input: {
  userId: string
  type: string
  subject: string
  body: string | null
  dedupeKey: string
}): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('notification_logs').insert({
      user_id: input.userId,
      channel: 'system',
      type: input.type,
      subject: input.subject,
      body: input.body,
      status: 'sent',
      dedupe_key: input.dedupeKey,
    })
    if (error?.code === UNIQUE_VIOLATION) return false
    if (error) console.log('[v0] notification claim failed:', error.message)
    return true
  } catch (error) {
    console.log('[v0] notification claim error:', error)
    return true
  }
}

/**
 * Releases a claim made by `claimNotification` when the send itself failed, so
 * a later retry (e.g. a webhook redelivery) can still deliver the email.
 */
export async function releaseNotificationClaim(dedupeKey: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('notification_logs').delete().eq('dedupe_key', dedupeKey)
  } catch (error) {
    console.log('[v0] notification release error:', error)
  }
}

/** Minimal branded HTML wrapper so account/billing emails look consistent. */
function emailShell(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;padding:32px 0;font-family:Arial,Helvetica,sans-serif;color:#e7e7ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#141419;border:1px solid #26262e;border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:18px;font-weight:700;letter-spacing:.14em;color:#b794ff">GLOVAL AI</div>
      </td></tr>
      <tr><td style="padding:8px 28px 4px">
        <h1 style="margin:0;font-size:20px;line-height:1.3;color:#ffffff">${heading}</h1>
      </td></tr>
      <tr><td style="padding:12px 28px 28px;font-size:14px;line-height:1.7;color:#c4c4cc">
        ${bodyHtml}
      </td></tr>
    </table>
    <div style="padding:16px;font-size:12px;color:#6b6b76">© ${new Date().getFullYear()} Gloval AI</div>
  </td></tr></table>
</body></html>`
}

/* --------------------------- account lifecycle --------------------------- */

/**
 * Notify a user their account was suspended: sends a warning email pointing to
 * support and records the event in the admin notification log. The log entry's
 * status reflects whether the email actually went out.
 */
export async function notifyAccountSuspended(input: {
  userId: string
  email: string | null
  actorEmail: string
}): Promise<void> {
  let emailSent = false
  if (input.email) {
    emailSent = await sendTransactionalEmail({
      to: input.email,
      subject: 'Hesabınız askıya alındı',
      replyTo: SUPPORT_EMAIL,
      text:
        'Gloval AI hesabınız askıya alınmıştır. Bu süre boyunca hesabınıza ve sitelerinize erişemezsiniz. ' +
        `İtirazınız veya sorunuz varsa ${SUPPORT_EMAIL} ile iletişime geçin.`,
      html: emailShell(
        'Hesabınız askıya alındı',
        `<p>Merhaba,</p>
         <p>Gloval AI hesabınız <strong>askıya alınmıştır</strong>. Bu süre boyunca yönetim paneline ve yayınladığınız sitelere erişiminiz kısıtlanır.</p>
         <p>Bunun bir hata olduğunu düşünüyorsanız ya da hesabınızı yeniden etkinleştirmek istiyorsanız
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#b794ff">${SUPPORT_EMAIL}</a> adresinden bizimle iletişime geçin.</p>
         <p style="margin-top:20px;color:#8b8b95">Gloval AI Ekibi</p>`,
      ),
    })
  }

  await recordNotification({
    userId: input.userId,
    channel: 'email',
    type: 'account_suspended',
    subject: 'Hesap askıya alındı',
    body: `Durum ${input.actorEmail} tarafından güncellendi. Kullanıcıya ${SUPPORT_EMAIL} yönlendirmesiyle bilgi maili ${
      emailSent ? 'gönderildi' : 'gönderilemedi'
    }.`,
    status: emailSent ? 'sent' : 'failed',
  })
}

/** Notify a user their account was reactivated (email + admin log). */
export async function notifyAccountReactivated(input: {
  userId: string
  email: string | null
  actorEmail: string
}): Promise<void> {
  let emailSent = false
  if (input.email) {
    emailSent = await sendTransactionalEmail({
      to: input.email,
      subject: 'Hesabınız yeniden etkinleştirildi',
      replyTo: SUPPORT_EMAIL,
      text:
        'Gloval AI hesabınız yeniden etkinleştirildi. Panelinize ve sitelerinize tekrar erişebilirsiniz.',
      html: emailShell(
        'Hesabınız yeniden etkinleştirildi',
        `<p>Merhaba,</p>
         <p>Gloval AI hesabınız <strong>yeniden etkinleştirildi</strong>. Yönetim panelinize ve sitelerinize tekrar erişebilirsiniz.</p>
         <p>Sorularınız için <a href="mailto:${SUPPORT_EMAIL}" style="color:#b794ff">${SUPPORT_EMAIL}</a>.</p>
         <p style="margin-top:20px;color:#8b8b95">Gloval AI Ekibi</p>`,
      ),
    })
  }

  await recordNotification({
    userId: input.userId,
    channel: 'email',
    type: 'account_reactivated',
    subject: 'Hesap yeniden etkinleştirildi',
    body: `Durum ${input.actorEmail} tarafından güncellendi. Bilgilendirme maili ${
      emailSent ? 'gönderildi' : 'gönderilemedi'
    }.`,
    status: emailSent ? 'sent' : 'failed',
  })
}

/* ------------------------------- billing --------------------------------- */

/**
 * Record a billing/user event so it appears in the admin "Bildirimler" screen.
 * The event is also emailed to the affected Supabase Auth user. When requested,
 * the same event is additionally emailed to the platform administrator.
 */
export async function logUserEvent(input: {
  userId: string
  type: string
  subject: string
  body?: string | null
  emailAdmin?: boolean
  includeBillingProfileReminder?: boolean
  adminSubject?: (userEmail: string) => string
  adminBody?: (userEmail: string) => string
  /**
   * Identifies one lifecycle/payment event. When set, the event is delivered at
   * most once: the log row (unique on this key) is claimed before anything is
   * emailed, so repeated callbacks or overlapping cron runs stay silent.
   * Returns false when the event was already delivered.
   */
  dedupeKey?: string
}): Promise<boolean> {
  let body = input.body ?? input.subject
  let notificationBody = input.body ?? null

  if (input.includeBillingProfileReminder) {
    try {
      const profileStatus = await getBillingProfileStatusForUser(input.userId)
      if (profileStatus.available && !profileStatus.complete) {
        body = appendBillingProfileReminder(body, true, 'tr')
        notificationBody = body
      }
    } catch {
      // Notification enrichment is best-effort and never blocks payment handling.
    }
  }

  if (input.dedupeKey) {
    const claimed = await claimNotification({
      userId: input.userId,
      type: input.type,
      subject: input.subject,
      body: notificationBody,
      dedupeKey: input.dedupeKey,
    })
    if (!claimed) return false
  } else {
    await recordNotification({
      userId: input.userId,
      channel: 'system',
      type: input.type,
      subject: input.subject,
      body: notificationBody,
      status: 'sent',
    })
  }

  const html = emailShell(input.subject, `<p>${body}</p>`)
  const admin = createAdminClient()
  const {
    data: { user },
  } = await admin.auth.admin.getUserById(input.userId)

  if (user?.email) {
    await sendTransactionalEmail({
      to: user.email,
      subject: input.subject,
      text: body,
      html,
    })
  }

  if (input.emailAdmin) {
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || 'doganboracom@gmail.com'
    const userEmail = user?.email ?? 'Bilinmiyor'
    const adminBody = input.adminBody?.(userEmail) ?? input.body ?? input.subject
    const adminSubject = input.adminSubject?.(userEmail) ?? `[Gloval AI] ${input.subject}`
    await sendTransactionalEmail({
      to: adminEmail,
      subject: adminSubject,
      text: adminBody,
      html: emailShell(adminSubject, `<p>${adminBody}</p>`),
    })
  }

  return true
}
