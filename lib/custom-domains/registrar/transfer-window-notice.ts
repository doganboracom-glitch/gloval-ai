import 'server-only'

import { resolveEmailLang, type EmailLang } from '@/lib/email/lang'
import { escape, renderEmailLayout } from '@/lib/email/layout'
import { sendTransactionalEmail, SUPPORT_EMAIL } from '@/lib/notify'
import type { AdminClient } from './transfer-window-store'

export type TransferWindowNoticeKind = 'opened' | 'reminder' | 'extended' | 'relocked'

export type TransferWindowNoticeInput = {
  kind: TransferWindowNoticeKind
  email: string
  lang: EmailLang
  domain: string
  customDomainId: string
  windowId: string
  relockAt?: string
  extensionCount?: number
}

const COPY = {
  tr: {
    opened: {
      subject: (domain: string) => `${domain} için transfer kilidi 72 saatliğine kaldırıldı`,
      preview: (domain: string) => `${domain} için transfer kodu görüntülendi.`,
      title: 'Transfer penceresi başlatıldı',
      body: (domain: string) =>
        `<strong>${escape(domain)}</strong> için transfer kilidi 72 saat boyunca kaldırıldı ve transfer kodu görüntülendi. Siz yapmadıysanız hemen şifrenizi değiştirin, kilidi etkinleştirin ve destekle iletişime geçin.`,
      cta: 'Kilidi hemen etkinleştir',
      text: (domain: string) =>
        `${domain} için transfer kilidi 72 saat boyunca kaldırıldı ve transfer kodu görüntülendi. Siz yapmadıysanız hemen şifrenizi değiştirin, kilidi etkinleştirin ve destekle iletişime geçin.`,
    },
    reminder: {
      subject: (domain: string) => `${domain} transfer kilidi 24 saat içinde etkinleşecek`,
      preview: (domain: string) => `${domain} için transfer penceresi sona ermek üzere.`,
      title: 'Transfer penceresi hatırlatması',
      body: (domain: string) =>
        `<strong>${escape(domain)}</strong> için transfer kilidi yaklaşık 24 saat sonra otomatik etkinleşecek. Transferi başlatmadıysanız süreyi uzatabilir veya kilidi hemen etkinleştirebilirsiniz.`,
      cta: 'Alan adı panelini aç',
      text: (domain: string) =>
        `${domain} için transfer kilidi yaklaşık 24 saat sonra otomatik etkinleşecek. Transferi başlatmadıysanız süreyi uzatabilir veya kilidi hemen etkinleştirebilirsiniz.`,
    },
    extended: {
      subject: (domain: string) => `${domain} transfer penceresi uzatıldı`,
      preview: (domain: string) => `${domain} transfer penceresinin yeni bitiş zamanı güncellendi.`,
      title: 'Transfer penceresi uzatıldı',
      body: (domain: string, relockAt: string) =>
        `<strong>${escape(domain)}</strong> transfer penceresi uzatıldı. Kilit ${escape(relockAt)} tarihinde otomatik etkinleşecek.`,
      cta: 'Alan adı panelini aç',
      text: (domain: string, relockAt: string) =>
        `${domain} transfer penceresi uzatıldı. Kilit ${relockAt} tarihinde otomatik etkinleşecek.`,
    },
    relocked: {
      subject: (domain: string) => `${domain} transfer kilidi otomatik etkinleştirildi`,
      preview: (domain: string) => `${domain} için transfer koruması yeniden etkin.`,
      title: 'Transfer kilidi etkinleştirildi',
      body: (domain: string) =>
        `<strong>${escape(domain)}</strong> transfer kilidi otomatik olarak yeniden etkinleştirildi. Alan adınız başka bir firmaya transfer edilemez.`,
      cta: 'Alan adı panelini aç',
      text: (domain: string) =>
        `${domain} transfer kilidi otomatik olarak yeniden etkinleştirildi. Alan adınız başka bir firmaya transfer edilemez.`,
    },
  },
  en: {
    opened: {
      subject: (domain: string) => `Transfer lock removed for ${domain} for 72 hours`,
      preview: (domain: string) => `The transfer code for ${domain} was viewed.`,
      title: 'Transfer window started',
      body: (domain: string) =>
        `The transfer lock for <strong>${escape(domain)}</strong> was removed for 72 hours and the transfer code was viewed. If this was not you, change your password immediately, enable the lock, and contact support.`,
      cta: 'Enable the lock now',
      text: (domain: string) =>
        `The transfer lock for ${domain} was removed for 72 hours and the transfer code was viewed. If this was not you, change your password immediately, enable the lock, and contact support.`,
    },
    reminder: {
      subject: (domain: string) => `${domain} transfer lock will be enabled in 24 hours`,
      preview: (domain: string) => `The transfer window for ${domain} is nearing its end.`,
      title: 'Transfer window reminder',
      body: (domain: string) =>
        `The transfer lock for <strong>${escape(domain)}</strong> will be enabled automatically in about 24 hours. If you have not started the transfer, you can extend the window or enable the lock now.`,
      cta: 'Open the domain panel',
      text: (domain: string) =>
        `The transfer lock for ${domain} will be enabled automatically in about 24 hours. If you have not started the transfer, you can extend the window or enable the lock now.`,
    },
    extended: {
      subject: (domain: string) => `${domain} transfer window extended`,
      preview: (domain: string) => `The new end time for the ${domain} transfer window is set.`,
      title: 'Transfer window extended',
      body: (domain: string, relockAt: string) =>
        `The transfer window for <strong>${escape(domain)}</strong> was extended. The lock will be enabled automatically at ${escape(relockAt)}.`,
      cta: 'Open the domain panel',
      text: (domain: string, relockAt: string) =>
        `The transfer window for ${domain} was extended. The lock will be enabled automatically at ${relockAt}.`,
    },
    relocked: {
      subject: (domain: string) => `Transfer lock re-enabled for ${domain}`,
      preview: (domain: string) => `Transfer protection for ${domain} is active again.`,
      title: 'Transfer lock re-enabled',
      body: (domain: string) =>
        `The transfer lock for <strong>${escape(domain)}</strong> was automatically re-enabled. Your domain cannot be transferred to another company.`,
      cta: 'Open the domain panel',
      text: (domain: string) =>
        `The transfer lock for ${domain} was automatically re-enabled. Your domain cannot be transferred to another company.`,
    },
  },
} as const

function formatRelockAt(value: string | undefined, lang: EmailLang): string {
  const time = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(time)) return lang === 'tr' ? 'yaklaşık 24 saat içinde' : 'in about 24 hours'
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(time))
}

export async function sendTransferWindowNotice(input: TransferWindowNoticeInput): Promise<boolean> {
  if (!input.email.trim()) return false

  try {
    const copy = COPY[input.lang][input.kind]
    const notices = COPY[input.lang]
    const panelUrl = `https://gloval.ai/dashboard/domains/${encodeURIComponent(input.customDomainId)}`
    const relockAt = formatRelockAt(input.relockAt, input.lang)
    const body =
      input.kind === 'extended'
        ? notices.extended.body(input.domain, relockAt)
        : input.kind === 'opened'
          ? notices.opened.body(input.domain)
          : input.kind === 'reminder'
            ? notices.reminder.body(input.domain)
            : notices.relocked.body(input.domain)
    const text =
      input.kind === 'extended'
        ? notices.extended.text(input.domain, relockAt)
        : input.kind === 'opened'
          ? notices.opened.text(input.domain)
          : input.kind === 'reminder'
            ? notices.reminder.text(input.domain)
            : notices.relocked.text(input.domain)
    const idempotencySuffix = input.kind === 'extended' ? `:${input.extensionCount ?? 0}` : ''

    return await sendTransactionalEmail({
      to: input.email,
      subject: copy.subject(input.domain),
      html: renderEmailLayout({
        lang: input.lang,
        previewText: copy.preview(input.domain),
        title: copy.title,
        body: `<p style="margin:0;">${body}</p>`,
        cta: { label: copy.cta, href: panelUrl },
        footer:
          input.lang === 'tr'
            ? `Bu e-posta alan adı güvenliğiniz için gönderildi. Destek: ${SUPPORT_EMAIL}.`
            : `This email was sent to protect your domain. Support: ${SUPPORT_EMAIL}.`,
      }),
      text: `${text}\n\n${panelUrl}\n${SUPPORT_EMAIL}`,
      replyTo: SUPPORT_EMAIL,
      idempotencyKey: `domain-transfer-window:${input.kind}:${input.windowId}${idempotencySuffix}`,
    })
  } catch {
    console.error('[transfer-window-notice] failed')
    return false
  }
}

export async function getTransferWindowRecipient(
  admin: AdminClient,
  userId: string,
): Promise<{ email: string; lang: EmailLang } | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    const user = data?.user
    if (error || !user?.email) return null
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    return { email: user.email, lang: resolveEmailLang(metadata.email_locale) }
  } catch {
    return null
  }
}
