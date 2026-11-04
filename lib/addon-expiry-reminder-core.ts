import { ADD_ONS, isAddOnCode } from '@/lib/add-ons'
import type { EmailLang } from '@/lib/email/lang'

/** Human label for the mail subject, derived from the catalog so it never drifts from capacity. */
export function addOnReminderName(code: string, lang: EmailLang): string {
  if (!isAddOnCode(code)) return lang === 'tr' ? 'Ek paket' : 'Add-on'
  const def = ADD_ONS[code]
  const tr = lang === 'tr'
  if (def.kind === 'mail') return tr ? `${def.capacity} e-posta kutusu` : `${def.capacity} mailbox${def.capacity > 1 ? 'es' : ''}`
  if (def.kind === 'product') return tr ? `${def.capacity} ürün` : `${def.capacity} products`
  if (def.siteTarget === 'ecommerce') return tr ? `${def.capacity} e-ticaret sitesi` : `${def.capacity} e-commerce site`
  return tr ? `${def.capacity} kurumsal site` : `${def.capacity} corporate site`
}

export type AddOnReminderStage = '30d' | '7d'

const DAY_MS = 24 * 60 * 60 * 1000

/** The sweep only needs to look this far ahead. */
export const ADDON_REMINDER_LOOKAHEAD_DAYS = 30

/**
 * Which reminder a yearly add-on is due for, or null when none.
 * A grant is only ever reminded for the stage it is currently inside: if the
 * cron was down and the 30-day window was missed, the 7-day mail still goes out
 * but a stale "30 days left" mail never does.
 */
export function resolveReminderStage(expiresAt: string | null, now: Date): AddOnReminderStage | null {
  if (!expiresAt) return null
  const end = Date.parse(expiresAt)
  if (!Number.isFinite(end)) return null
  const msLeft = end - now.getTime()
  if (msLeft <= 0) return null
  if (msLeft <= 7 * DAY_MS) return '7d'
  if (msLeft <= ADDON_REMINDER_LOOKAHEAD_DAYS * DAY_MS) return '30d'
  return null
}

export function reminderDedupeKey(entitlementId: string, stage: AddOnReminderStage): string {
  return `addon_expiry_reminder:${entitlementId}:${stage}`
}

export function daysLeft(expiresAt: string, now: Date): number {
  return Math.max(1, Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS))
}

export type AddOnReminderCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  ctaLabel: string
  footer: string
}

export function buildAddOnReminderCopy(input: {
  lang: EmailLang
  addOnName: string
  expiresAt: string
  days: number
}): AddOnReminderCopy {
  const locale = input.lang === 'tr' ? 'tr-TR' : 'en-US'
  const date = new Date(input.expiresAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
  if (input.lang === 'tr') {
    return {
      subject: `${input.addOnName} ek paketinizin süresi ${input.days} gün içinde doluyor`,
      previewText: `${input.addOnName} paketi ${date} tarihinde sona eriyor.`,
      title: 'Ek paketinizin süresi dolmak üzere',
      paragraphs: [
        `${input.addOnName} ek paketiniz ${date} tarihinde sona erecek (${input.days} gün kaldı).`,
        'Süre dolduğunda pakete bağlı ek kapasite kaldırılır; mevcut içerikleriniz silinmez ancak plan limitinizi aşan kısımlar için yeni ekleme yapamazsınız.',
        'Kesintisiz devam etmek için paketi şimdi yeniden satın alabilirsiniz.',
      ],
      ctaLabel: 'Paketi yenile',
      footer: 'Bu e-posta GLOVAL AI ek paket aboneliğiniz nedeniyle gönderildi.',
    }
  }
  return {
    subject: `Your ${input.addOnName} add-on expires in ${input.days} days`,
    previewText: `Your ${input.addOnName} add-on ends on ${date}.`,
    title: 'Your add-on is about to expire',
    paragraphs: [
      `Your ${input.addOnName} add-on ends on ${date} (${input.days} days left).`,
      'When it expires, the extra capacity is removed. Existing content is kept, but you will not be able to add more beyond your plan limit.',
      'Buy it again now to keep your capacity without a gap.',
    ],
    ctaLabel: 'Renew add-on',
    footer: 'You are receiving this because you own a GLOVAL AI add-on.',
  }
}
