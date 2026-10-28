import type { EmailLang } from '@/lib/email/lang'
import { renderPaymentReceiptEmail, type PaymentReceiptEmail } from '@/lib/email/payment-receipt'
import { formatReceiptAmount, type PaymentReceiptCopy } from '@/lib/email/payment-receipt-copy'

/**
 * "Your invoice is ready" email. It reuses the payment-receipt layout and
 * renderer; only the wording lives here. Pure: no I/O, every dynamic value is
 * escaped by the shared renderer.
 */

export type InvoiceReadyInput = {
  lang: EmailLang
  name?: string | null
  invoiceNumber: string
  /** `YYYY-MM-DD`, the date printed on the invoice. */
  invoiceDate: string
  amountKurus: number
  currency: string
  transactionNumber: string
  /** False when the PDF could not be attached: the email then points to the billing page. */
  attachmentIncluded: boolean
  billingUrl: string
  supportEmail: string
}

const LOCALE: Record<EmailLang, string> = { tr: 'tr-TR', en: 'en-US' }

export function formatInvoiceDate(isoDate: string, lang: EmailLang): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export function buildInvoiceReadyCopy(input: InvoiceReadyInput): PaymentReceiptCopy {
  const tr = input.lang === 'tr'
  const name = input.name?.trim()
  const amount = formatReceiptAmount(input.amountKurus, input.currency, input.lang)

  const paragraphs = [
    name ? (tr ? `Merhaba ${name},` : `Hi ${name},`) : '',
    tr
      ? 'Ödemenize ait fatura düzenlendi.'
      : 'The invoice for your payment has been issued.',
    input.attachmentIncluded
      ? tr
        ? 'Faturanızı bu e-postanın ekinde PDF olarak bulabilirsiniz. Dilediğiniz zaman Faturalandırma sayfasındaki ödeme geçmişinizden de indirebilirsiniz.'
        : 'You will find your invoice attached to this email as a PDF. You can also download it any time from your payment history on the billing page.'
      : tr
        ? 'Fatura dosyası bu e-postaya eklenemedi. Faturanızı Faturalandırma sayfasındaki ödeme geçmişinizden indirebilirsiniz.'
        : 'The invoice file could not be attached to this email. You can download it from your payment history on the billing page.',
  ].filter(Boolean)

  return {
    subject: tr ? 'Faturanız hazır — GLOVAL AI' : 'Your invoice is ready — GLOVAL AI',
    previewText: tr ? `${input.invoiceNumber} numaralı faturanız hazır.` : `Invoice ${input.invoiceNumber} is ready.`,
    title: tr ? 'Faturanız hazır' : 'Your invoice is ready',
    paragraphs,
    details: [
      [tr ? 'Fatura No' : 'Invoice number', input.invoiceNumber],
      [tr ? 'Fatura tarihi' : 'Invoice date', formatInvoiceDate(input.invoiceDate, input.lang)],
      [tr ? 'Tutar' : 'Amount', tr ? `${amount} (KDV dahil)` : `${amount} (VAT included)`],
      [tr ? 'İşlem No' : 'Reference', input.transactionNumber],
    ],
    cta: { label: tr ? 'Faturalandırmayı görüntüle' : 'View billing', href: input.billingUrl },
    support: {
      text: tr ? 'Faturayla ilgili bir sorunuz olursa bize yazabilirsiniz:' : 'If you have a question about the invoice, write to us at',
      label: input.supportEmail,
      href: `mailto:${input.supportEmail}`,
    },
    footer: tr
      ? `Bu e-posta, ödemenize ait fatura düzenlendiği için gönderildi. Yardım için ${input.supportEmail}.`
      : `This email was sent because the invoice for your payment was issued. Need help? ${input.supportEmail}.`,
  }
}

export function buildInvoiceReadyEmail(input: InvoiceReadyInput): PaymentReceiptEmail {
  return renderPaymentReceiptEmail(buildInvoiceReadyCopy(input), input.lang)
}
