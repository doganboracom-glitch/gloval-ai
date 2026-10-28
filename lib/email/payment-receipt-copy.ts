import type { EmailLang } from '@/lib/email/lang'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'

/**
 * Wording of the payment-received emails, in the same two languages as the
 * lifecycle emails (Turkish, and English for every other language). Pure data,
 * no markup: `lib/email/payment-receipt.ts` renders it with the shared email
 * layout and derives the plain-text version from the same fields.
 *
 * Only the AI add-on pack ("ai_topup") is defined today. Other payment emails
 * can be added as new kinds without touching the renderer.
 */

export type PaymentReceiptKind = 'ai_topup'

export type PaymentReceiptCopyInput = {
  kind: PaymentReceiptKind
  lang: EmailLang
  /** AI operations added by the purchase. */
  credits: number
  /** Gross price in minor units (kuruş), VAT included. */
  amountCents: number
  currency: string
  paidAt: Date
  /** Display reference such as `GLV-8F4K2M`; never the raw provider reference. */
  ticketNumber: string
  supportEmail: string
  /** Absolute URL of the billing page. */
  billingUrl: string
  /** True when the buyer's billing profile is incomplete (adds the existing reminder). */
  billingProfileIncomplete?: boolean
}

type TextLink = { text: string; label: string; href: string }

export type PaymentReceiptCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  details: Array<[string, string]>
  cta: { label: string; href: string }
  /** Billing-profile reminder; present only while the profile is incomplete. */
  reminder?: TextLink
  support: TextLink
  /** Second contact option shown right after `support` (e.g. the support address next to a ticket link). */
  supportAlternative?: TextLink
  footer: string
}

const LOCALE: Record<EmailLang, string> = { tr: 'tr-TR', en: 'en-US' }

/** Formats minor units in the recipient's language, e.g. `₺199` / `₺199.50`. */
export function formatReceiptAmount(amountCents: number, currency: string, lang: EmailLang): string {
  const amount = amountCents / 100
  const code = currency.trim().toUpperCase()
  try {
    return new Intl.NumberFormat(LOCALE[lang], {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

/** Date and time in Türkiye time, with the zone shown so the receipt is unambiguous. */
export function formatReceiptDate(date: Date, lang: EmailLang): string {
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
    timeZoneName: 'short',
  }).format(date)
}

export function buildPaymentReceiptCopy(input: PaymentReceiptCopyInput): PaymentReceiptCopy {
  const tr = input.lang === 'tr'
  const credits = input.credits
  const amount = formatReceiptAmount(input.amountCents, input.currency, input.lang)
  const profile = getBillingProfileCopy(input.lang)

  return {
    // Same subject as the log row; the English variant only applies to non-Turkish recipients.
    subject: tr ? 'Ödeme başarılı — AI işlemleri eklendi' : 'Payment successful — AI credits added',
    previewText: tr
      ? `${credits} AI işlemi hesabına eklendi.`
      : `${credits} AI credits were added to your account.`,
    title: tr ? 'Ödemen alındı' : 'Payment received',
    paragraphs: [
      tr
        ? `Ek AI paketi ödemen onaylandı ve hesabına ${credits} AI işlemi eklendi.`
        : `Your AI add-on payment was confirmed and ${credits} AI credits were added to your account.`,
      tr
        ? 'Satın aldığın işlemler aboneliğe bağlı değildir ve aylık yenilenen işlemlerine eklenir.'
        : 'Purchased credits are not tied to your subscription and are added on top of your monthly credits.',
    ],
    details: [
      [tr ? 'Ürün' : 'Item', tr ? `Ek AI paketi: +${credits} AI işlemi` : `AI add-on pack: +${credits} AI credits`],
      [tr ? 'Eklenen kredi' : 'Credits added', tr ? `${credits} AI işlemi` : `${credits} AI credits`],
      [tr ? 'Tutar' : 'Amount', tr ? `${amount} (KDV dahil)` : `${amount} (VAT included)`],
      [tr ? 'Tarih' : 'Date', formatReceiptDate(input.paidAt, input.lang)],
      [tr ? 'İşlem No' : 'Reference', input.ticketNumber],
      [tr ? 'Ödeme yöntemi' : 'Payment method', tr ? 'iyzico güvenli ödeme' : 'iyzico secure payment'],
    ],
    cta: { label: tr ? 'Faturalandırmayı görüntüle' : 'View billing', href: input.billingUrl },
    reminder: input.billingProfileIncomplete
      ? {
          text: profile.creditReminder,
          label: profile.bannerCta,
          href: `${input.billingUrl}#fatura-bilgileri`,
        }
      : undefined,
    support: {
      text: tr ? 'Bir sorun olursa bize yazabilirsin:' : 'If anything looks wrong, write to us at',
      label: input.supportEmail,
      href: `mailto:${input.supportEmail}`,
    },
    footer: tr
      ? `Bu e-posta ek AI paketi ödemen onaylandığı için gönderildi. Yardım için ${input.supportEmail}.`
      : `This email was sent because your AI add-on payment was confirmed. Need help? ${input.supportEmail}.`,
  }
}

export function paymentReceiptToText(copy: PaymentReceiptCopy): string {
  const parts = [copy.title, ...copy.paragraphs, copy.details.map(([label, value]) => `${label}: ${value}`).join('\n')]
  parts.push(`${copy.cta.label}: ${copy.cta.href}`)
  if (copy.reminder) parts.push(`${copy.reminder.text}\n${copy.reminder.href}`)
  const supportLines = [
    // A mailto label already is the address; any other link needs its URL spelled out in plain text.
    copy.support.href.startsWith('mailto:')
      ? `${copy.support.text} ${copy.support.label}`
      : `${copy.support.text} ${copy.support.label}: ${copy.support.href}`,
  ]
  if (copy.supportAlternative) supportLines.push(`${copy.supportAlternative.text} ${copy.supportAlternative.label}`)
  parts.push(supportLines.join('\n'), copy.footer)
  return parts.join('\n\n')
}
