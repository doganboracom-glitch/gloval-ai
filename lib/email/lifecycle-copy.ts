import { AI_CREDIT_CONFIG, PAGE_LIMITS, SITE_LIMITS } from '@/lib/pricing-config'
import type { EmailLang } from '@/lib/email/lang'

/**
 * Wording of the three lifecycle emails (welcome, first publish, site removed)
 * in Turkish and English. Pure data, no markup: the outbox renders it with the
 * shared email layout and derives the plain-text version from the same fields.
 * No prices and no figures other than the plan limits / gift credits that come
 * from `lib/pricing-config.ts`.
 */

export type LifecycleKind = 'account_welcome' | 'project_first_published' | 'project_unpublished'

export type LifecycleCopyInput = {
  kind: LifecycleKind
  lang: EmailLang
  /** First name, already trimmed; empty when unknown. */
  name: string
  siteName?: string
  siteUrl?: string
  dashboardUrl: string
  supportEmail: string
  /** Only the first-publish email differs by plan; defaults to `free`. */
  plan?: 'free' | 'paid'
}

export type LifecycleCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  steps?: { title: string; items: string[] }
  details?: Array<[string, string]>
  /** A sentence ending in a text link (e.g. "choose a plan" or "connect a domain"). */
  note?: { text: string; label: string; href: string }
  cta: { label: string; href: string }
  footer: string
}

/** Header values must stay on one line, whatever a user typed as a name. */
function oneLine(value: string): string {
  return value.replace(/[\r\n\t\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function firstNameOf(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return oneLine(raw).split(' ')[0].slice(0, 40)
}

export function buildLifecycleCopy(input: LifecycleCopyInput): LifecycleCopy {
  const tr = input.lang === 'tr'
  const siteName = oneLine(input.siteName ?? '') || (tr ? 'Siteniz' : 'Your site')
  const support = input.supportEmail
  const origin = new URL(input.dashboardUrl).origin

  if (input.kind === 'account_welcome') {
    const credits = AI_CREDIT_CONFIG.free.credits
    const sites = SITE_LIMITS.free
    const pages = PAGE_LIMITS.free
    const subject = tr
      ? input.name
        ? `GLOVAL AI'a hoş geldin, ${input.name}`
        : "GLOVAL AI'a hoş geldin"
      : input.name
        ? `Welcome to GLOVAL AI, ${input.name}`
        : 'Welcome to GLOVAL AI'
    return {
      subject,
      previewText: tr
        ? `Hesabın hazır. ${credits} yapay zekâ kredin tanımlandı.`
        : `Your account is ready. ${credits} AI credits have been added.`,
      title: subject,
      paragraphs: [
        tr
          ? `Hesabın hazır. ${credits} yapay zekâ kredin tanımlandı (tek seferlik hediye).`
          : `Your account is ready. ${credits} AI credits have been added (a one-time gift).`,
        tr
          ? `FREE pakette ${sites} site ve ${pages} sayfa hakkın var. Yayına aldığında siten adin.gloval.site biçiminde bir adreste açılır.`
          : `The FREE plan includes ${sites} site and ${pages} pages. Once published, your site opens at an address like yourname.gloval.site.`,
      ],
      steps: {
        title: tr ? 'Başlamak için' : 'How to get started',
        items: tr
          ? [
              'Taslağını aç ve düzenle.',
              'Görselleri ve metinleri kendine göre değiştir.',
              'Hazır olunca yayınla.',
            ]
          : [
              'Open your draft and edit it.',
              'Replace the images and text with your own.',
              'Publish when you are ready.',
            ],
      },
      cta: { label: tr ? 'Sitemi düzenle' : 'Edit my site', href: input.dashboardUrl },
      footer: tr
        ? `Bu e-posta GLOVAL AI hesabın oluşturulduğu için gönderildi. Yardım için ${support}.`
        : `This email was sent because your GLOVAL AI account was created. Need help? ${support}.`,
    }
  }

  const url = input.siteUrl ?? input.dashboardUrl

  if (input.kind === 'project_first_published') {
    const paid = input.plan === 'paid'
    const subject = tr ? `Siteniz yayında: ${siteName}` : `Your site is live: ${siteName}`
    const note = paid
      ? {
          text: tr ? 'Sitene kendi alan adını bağlayabilirsin:' : 'You can connect your own domain to your site:',
          label: tr ? 'Alan adı bağla' : 'Connect a domain',
          href: `${origin}/dashboard/domains`,
        }
      : {
          text: tr
            ? 'Sitenin kendi alan adında yayınlamak istersen üst paketlerden birini seçebilirsin:'
            : 'If you would like to publish on your own domain, you can choose one of the higher plans:',
          label: tr ? 'Paketleri gör' : 'See plans',
          href: `${origin}/billing`,
        }
    return {
      subject,
      previewText: tr ? `${siteName} artık herkese açık.` : `${siteName} is now public.`,
      title: tr ? 'Siteniz yayında' : 'Your site is live',
      paragraphs: [
        tr
          ? `${siteName} ilk kez yayına alındı ve artık herkes tarafından görülebiliyor.`
          : `${siteName} has been published for the first time and is now visible to everyone.`,
        tr
          ? 'Dilediğin zaman düzenleyebilir, yaptığın değişiklikleri yeniden yayınlayarak canlı siteye taşıyabilirsin.'
          : 'You can keep editing it and publish again whenever you want your changes to go live.',
      ],
      details: [[tr ? 'Site adresi' : 'Site address', url]],
      note,
      cta: { label: tr ? 'Siteyi aç' : 'Open site', href: url },
      footer: tr
        ? `Bu e-posta sitenin yayına alınması nedeniyle gönderildi. Yardım için ${support}.`
        : `This email was sent because your site was published. Need help? ${support}.`,
    }
  }

  const subject = tr
    ? `Siteniz yayından kaldırıldı: ${siteName}`
    : `Your site was unpublished: ${siteName}`
  return {
    subject,
    previewText: tr
      ? `${siteName} artık herkese açık değil.`
      : `${siteName} is no longer public.`,
    title: tr ? 'Siteniz yayından kaldırıldı' : 'Your site was unpublished',
    paragraphs: [
      tr
        ? `${siteName} yayından kaldırıldı; adresi artık ziyaretçilere açılmıyor.`
        : `${siteName} was unpublished; its address no longer opens for visitors.`,
      tr
        ? 'İçeriğin silinmedi, saklanıyor. İstediğin zaman düzenleyip tekrar yayınlayabilirsin.'
        : 'Your content was not deleted; it is kept. You can edit it and publish again whenever you like.',
      tr
        ? `Bu işlemi sen yapmadıysan lütfen ${support} adresine yaz.`
        : `If you did not do this, please write to ${support}.`,
    ],
    cta: { label: tr ? 'Siteyi aç' : 'Open site', href: input.dashboardUrl },
    footer: tr
      ? `Bu e-posta sitenin yayından kaldırılması nedeniyle gönderildi. Yardım için ${support}.`
      : `This email was sent because your site was unpublished. Need help? ${support}.`,
  }
}

export function lifecycleCopyToText(copy: LifecycleCopy): string {
  const parts = [copy.title, ...copy.paragraphs]
  if (copy.steps) {
    parts.push([copy.steps.title, ...copy.steps.items.map((item, i) => `${i + 1}) ${item}`)].join('\n'))
  }
  if (copy.details) parts.push(copy.details.map(([label, value]) => `${label}: ${value}`).join('\n'))
  if (copy.note) parts.push(`${copy.note.text}\n${copy.note.href}`)
  parts.push(`${copy.cta.label}: ${copy.cta.href}`, copy.footer)
  return parts.join('\n\n')
}
