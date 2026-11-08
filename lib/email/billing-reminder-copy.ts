import type { EmailLang } from '@/lib/email/lang'
import type { LifecycleCopy } from '@/lib/email/lifecycle-copy'
import type { BillingReminderKind } from '@/lib/billing-reminders-core'

/**
 * Turkish and English wording of the subscription reminder emails. Pure data:
 * the outbox renders it with the shared email layout. No amounts are written
 * (the charge can differ from the catalog price), only plan, dates and what
 * happens to the customer's sites.
 */

export type BillingReminderCopyInput = {
  kind: BillingReminderKind
  lang: EmailLang
  planName: string
  /** End of the paid period (ISO). */
  periodEnd: string
  /** End of the payment grace window, when it applies. */
  graceEnd: Date | null
  /** Whole days until `periodEnd` (renewal / cancellation reminders). */
  daysLeft: number
  /** True when the suspension actually took sites offline. */
  sitesUnpublished: boolean
  billingUrl: string
  supportEmail: string
}

const BILLING_TIME_ZONE = 'Europe/Istanbul'

function formatDate(value: string | Date, lang: EmailLang): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BILLING_TIME_ZONE,
  }).format(typeof value === 'string' ? new Date(value) : value)
}

export function buildBillingReminderCopy(input: BillingReminderCopyInput): LifecycleCopy {
  const tr = input.lang === 'tr'
  const plan = input.planName
  const periodEnd = formatDate(input.periodEnd, input.lang)
  const grace = input.graceEnd ? formatDate(input.graceEnd, input.lang) : null
  const support = input.supportEmail
  const manage = { label: tr ? 'Aboneliği yönet' : 'Manage subscription', href: input.billingUrl }
  const pay = { label: tr ? 'Ödemeyi tamamla' : 'Complete payment', href: input.billingUrl }
  const planRow: [string, string] = [tr ? 'Paket' : 'Plan', plan]
  const footer = (reason: string, reasonEn: string) =>
    tr ? `Bu e-posta ${reason} için gönderildi. Yardım için ${support}.` : `This email was sent ${reasonEn}. Need help? ${support}.`

  switch (input.kind) {
    case 'renewal_upcoming_7d':
    case 'renewal_upcoming_3d':
    case 'renewal_upcoming_1d': {
      const days = Math.max(1, input.daysLeft)
      const subject = tr
        ? `Aboneliğin ${days} gün sonra yenilenecek`
        : `Your subscription renews in ${days} ${days === 1 ? 'day' : 'days'}`
      return {
        subject,
        previewText: tr ? `${plan} paketin ${periodEnd} tarihinde yenilenir.` : `Your ${plan} plan renews on ${periodEnd}.`,
        title: subject,
        paragraphs: [
          tr
            ? `${plan} aboneliğinin mevcut dönemi ${periodEnd} tarihinde sona eriyor ve yeni dönem için yenilenecek.`
            : `The current period of your ${plan} subscription ends on ${periodEnd} and will renew for the next period.`,
          tr
            ? 'Yenilemeyi istemiyorsan, dönem bitmeden aboneliği iptal edebilirsin. İptal edersen dönem sonuna kadar hizmetlerin açık kalır.'
            : 'If you do not want to renew, you can cancel before the period ends. Your services stay on until the end of the period.',
        ],
        details: [planRow, [tr ? 'Dönem sonu' : 'Period ends', periodEnd]],
        cta: manage,
        footer: footer('aboneliğinin yenilenmesi yaklaştığı için', 'because your subscription is about to renew'),
      }
    }
    case 'period_ending_notice': {
      const subject = tr ? 'Aboneliğin dönem sonunda sona erecek' : 'Your subscription will end at the period end'
      return {
        subject,
        previewText: tr ? `${plan} paketin ${periodEnd} tarihinde sona eriyor.` : `Your ${plan} plan ends on ${periodEnd}.`,
        title: subject,
        paragraphs: [
          tr
            ? `${plan} aboneliğini iptal ettiğin için ${periodEnd} tarihinde sona erecek ve yenilenmeyecek.`
            : `Because you cancelled, your ${plan} subscription will end on ${periodEnd} and will not renew.`,
          tr
            ? 'Fikrini değiştirirsen, dönem bitmeden aboneliği yeniden etkinleştirebilirsin.'
            : 'If you change your mind, you can resume the subscription before the period ends.',
        ],
        details: [planRow, [tr ? 'Bitiş tarihi' : 'Ends on', periodEnd]],
        cta: manage,
        footer: footer('aboneliğini iptal ettiğin için', 'because you cancelled your subscription'),
      }
    }
    case 'payment_failed':
    case 'payment_failed_day2':
    case 'payment_failed_final': {
      const final = input.kind === 'payment_failed_final'
      const followUp = input.kind === 'payment_failed_day2'
      const subject = final
        ? tr
          ? 'Son uyarı: ödemeni tamamla, siteler yayından kalkmasın'
          : 'Final warning: complete your payment to keep your sites live'
        : followUp
          ? tr
            ? 'Hatırlatma: abonelik ödemen hâlâ alınamadı'
            : 'Reminder: your subscription payment is still outstanding'
          : tr
            ? 'Abonelik ödemen alınamadı'
            : 'Your subscription payment failed'
      const paragraphs = [
        tr
          ? `${plan} aboneliğinin yenileme ödemesi alınamadı (dönem sonu: ${periodEnd}).`
          : `We could not collect the renewal payment for your ${plan} subscription (period ended ${periodEnd}).`,
        grace
          ? tr
            ? `Hizmetlerin ${grace} tarihine kadar geçici olarak açık tutuluyor. Bu tarihe kadar ödeme yapılmazsa siteler yayından kaldırılır; içerikler silinmez.`
            : `Your services are kept active until ${grace}. If payment is not received by then, your sites are taken offline; your content is not deleted.`
          : tr
            ? 'Ödeme yapılmazsa siteler yayından kaldırılır; içerikler silinmez.'
            : 'If payment is not received, your sites are taken offline; your content is not deleted.',
        tr ? 'Aşağıdaki bağlantıdan ödemeyi güvenle tamamlayabilirsin.' : 'You can complete the payment securely using the link below.',
      ]
      return {
        subject,
        previewText: grace
          ? tr
            ? `Son tarih: ${grace}.`
            : `Deadline: ${grace}.`
          : tr
            ? 'Ödemeyi tamamla.'
            : 'Complete your payment.',
        title: subject,
        paragraphs,
        details: [planRow, ...(grace ? ([[tr ? 'Son ödeme tarihi' : 'Pay by', grace]] as Array<[string, string]>) : [])],
        cta: pay,
        footer: footer('abonelik ödemen alınamadığı için', 'because your subscription payment failed'),
      }
    }
    case 'subscription_suspended': {
      const subject = tr ? 'Aboneliğin askıya alındı' : 'Your subscription was suspended'
      return {
        subject,
        previewText: input.sitesUnpublished
          ? tr
            ? 'Siteler yayından kaldırıldı, içerikler saklanıyor.'
            : 'Your sites were taken offline; your content is kept.'
          : tr
            ? 'Ödeme alınamadığı için aboneliğin askıya alındı.'
            : 'Your subscription was suspended because payment was not received.',
        title: subject,
        paragraphs: [
          tr
            ? `Ödeme süresi dolduğu ve ödeme alınamadığı için ${plan} aboneliğin askıya alındı.`
            : `Your ${plan} subscription was suspended because the payment period ran out and payment was not received.`,
          input.sitesUnpublished
            ? tr
              ? 'Yayındaki siteler yayından kaldırıldı. İçeriklerin silinmedi, saklanıyor.'
              : 'Your published sites were taken offline. Your content was not deleted and is kept.'
            : tr
              ? 'İçeriklerin silinmedi, saklanıyor.'
              : 'Your content was not deleted and is kept.',
          tr
            ? 'Ödemeyi tamamladığında abonelik yeniden etkinleşir ve siteler paket limitin dahilinde otomatik olarak yeniden yayına alınır.'
            : 'Once you complete the payment, the subscription is reactivated and your sites are published again automatically, within your plan limits.',
        ],
        details: [planRow],
        cta: pay,
        footer: footer('aboneliğin askıya alındığı için', 'because your subscription was suspended'),
      }
    }
  }
}
