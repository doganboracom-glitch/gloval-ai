import { createAdminClient } from '@/lib/supabase/admin'
import { renderEmailLayout, escape, type EmailLang } from '@/lib/email/layout'
import { sendTransactionalEmail, SUPPORT_EMAIL } from '@/lib/notify'

/**
 * Security notice sent when a transfer (EPP) code is revealed. It names the
 * domain only; the code itself is never part of the message.
 *
 * Idempotent per user + domain + hour: a reservation row (limit 1 / hour) stops a
 * second send from this app, and the Resend idempotency key stops a retried
 * request from delivering twice. Failures are swallowed: the notice must never
 * block the reveal, and nothing sensitive reaches the log.
 */

const COPY = {
  tr: {
    subject: (domain: string) => `${domain} için transfer kodu görüntülendi`,
    preview: (domain: string) => `${domain} için transfer kodu görüntülendi.`,
    title: 'Transfer kodu görüntülendi',
    body: (domain: string) =>
      `<strong>${escape(domain)}</strong> için transfer kodu görüntülendi. Siz değilseniz hemen şifrenizi değiştirin ve destekle iletişime geçin.`,
    cta: 'Destekle iletişime geç',
    footer: `Bu e-posta hesabınızın güvenliği için gönderildi. Sorularınız için ${SUPPORT_EMAIL}.`,
    text: (domain: string) =>
      `${domain} için transfer kodu görüntülendi. Siz değilseniz hemen şifrenizi değiştirin ve destekle iletişime geçin: ${SUPPORT_EMAIL}`,
  },
  en: {
    subject: (domain: string) => `Transfer code viewed for ${domain}`,
    preview: (domain: string) => `The transfer code for ${domain} was viewed.`,
    title: 'Transfer code viewed',
    body: (domain: string) =>
      `The transfer code for <strong>${escape(domain)}</strong> was viewed. If this was not you, change your password immediately and contact support.`,
    cta: 'Contact support',
    footer: `This email was sent to protect your account. Questions: ${SUPPORT_EMAIL}.`,
    text: (domain: string) =>
      `The transfer code for ${domain} was viewed. If this was not you, change your password immediately and contact support: ${SUPPORT_EMAIL}`,
  },
} as const satisfies Record<EmailLang, unknown>

export async function notifyTransferCodeViewed(input: {
  userId: string
  email: string
  domain: string
  lang: EmailLang
}): Promise<'sent' | 'skipped'> {
  try {
    if (!input.email) return 'skipped'
    const hourBucket = Math.floor(Date.now() / 3_600_000)

    const { data, error } = await createAdminClient()
      .rpc('reserve_rate_limit', {
        p_subject: `domain:transfer-code-notice:${input.userId}:${input.domain}`,
        p_limit: 1,
        p_window_seconds: 60 * 60,
      })
      .maybeSingle()
    const reservation = data as { allowed?: unknown } | null
    if (error || !reservation || reservation.allowed !== true) return 'skipped'

    const copy = COPY[input.lang]
    const ok = await sendTransactionalEmail({
      to: input.email,
      subject: copy.subject(input.domain),
      html: renderEmailLayout({
        lang: input.lang,
        previewText: copy.preview(input.domain),
        title: copy.title,
        body: `<p style="margin:0;">${copy.body(input.domain)}</p>`,
        cta: { label: copy.cta, href: 'https://gloval.ai/support/new' },
        footer: copy.footer,
      }),
      text: copy.text(input.domain),
      replyTo: SUPPORT_EMAIL,
      idempotencyKey: `transfer-code-viewed:${input.userId}:${input.domain}:${hourBucket}`,
    })
    return ok ? 'sent' : 'skipped'
  } catch {
    console.error('[transfer-code-notice] failed')
    return 'skipped'
  }
}
