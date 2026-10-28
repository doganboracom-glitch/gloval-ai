import { escape, renderEmailLayout, renderTable } from '@/lib/email/layout'
import type { EmailLang } from '@/lib/email/lang'
import {
  buildPaymentReceiptCopy,
  paymentReceiptToText,
  type PaymentReceiptCopy,
  type PaymentReceiptCopyInput,
} from '@/lib/email/payment-receipt-copy'

export type PaymentReceiptEmail = { subject: string; html: string; text: string }

const paragraph = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`

const link = (href: string, label: string) =>
  `<a class="link" href="${escape(href)}" style="color:#6d43bd;text-decoration:underline;">${escape(label)}</a>`

/**
 * Renders a payment-received email with the same layout as the welcome,
 * first-publish and unpublish emails: shared header, summary table, button
 * and footer. Every dynamic value is escaped by the layout helpers or here.
 */
export function renderPaymentReceiptEmail(copy: PaymentReceiptCopy, lang: EmailLang): PaymentReceiptEmail {
  const body = [
    ...copy.paragraphs.map((text) => paragraph(escape(text))),
    renderTable(copy.details),
    copy.reminder ? paragraph(`${escape(copy.reminder.text)} ${link(copy.reminder.href, copy.reminder.label)}`) : '',
    paragraph(
      `${escape(copy.support.text)} ${link(copy.support.href, copy.support.label)}` +
        (copy.supportAlternative
          ? ` ${escape(copy.supportAlternative.text)} ${link(copy.supportAlternative.href, copy.supportAlternative.label)}`
          : ''),
    ),
  ].join('')

  const html = renderEmailLayout({
    lang,
    previewText: copy.previewText,
    title: copy.title,
    body,
    cta: copy.cta,
    footer: copy.footer,
  })

  return { subject: copy.subject, html, text: paymentReceiptToText(copy) }
}

export function buildPaymentReceiptEmail(input: PaymentReceiptCopyInput): PaymentReceiptEmail {
  return renderPaymentReceiptEmail(buildPaymentReceiptCopy(input), input.lang)
}
