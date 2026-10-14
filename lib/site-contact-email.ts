import { escape, renderEmailLayout, renderEmailPlainText, renderSection, renderTable } from '@/lib/email/layout'
import type { EmailLang } from '@/lib/email/lang'
import { dashboardMessagesUrl } from '@/lib/site-url'

export type ContactEmailInput = {
  siteName: string
  lang: EmailLang
  name: string
  email: string
  phone: string | null
  message: string
}

/** A site name is owner-controlled text that ends up in a subject line. */
function cleanSiteName(value: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  return cleaned || 'Gloval'
}

/**
 * Builds the owner notification. Every visitor-supplied value is escaped by the
 * shared layout helpers; the message body is escaped here before line breaks
 * become <br>, so no visitor markup can ever reach the HTML.
 */
export function buildContactEmail(input: ContactEmailInput) {
  const messagesUrl = dashboardMessagesUrl()
  const siteName = cleanSiteName(input.siteName)
  const tr = input.lang === 'tr'
  const subject = tr
    ? `Siteniz ${siteName} üzerinden yeni bir mesaj`
    : `New message through your site ${siteName}`
  const intro = tr
    ? `${siteName} sitenizin iletişim formundan yeni bir mesaj geldi. Yanıtlamak için bu e-postayı yanıtlamanız yeterli; yanıtınız doğrudan ziyaretçiye gider.`
    : `A new message arrived through the contact form of ${siteName}. Reply to this email to answer; your reply goes straight to the visitor.`
  const labels = tr
    ? { name: 'Ad Soyad', email: 'E-posta', phone: 'Telefon', message: 'Mesaj', cta: 'Mesajlarım' }
    : { name: 'Name', email: 'Email', phone: 'Phone', message: 'Message', cta: 'My messages' }
  const footer = tr
    ? `Bu e-posta ${siteName} sitenizin iletişim formu üzerinden GLOVAL AI tarafından gönderildi.`
    : `This email was sent by GLOVAL AI through the contact form of ${siteName}.`

  const rows: Array<[string, string]> = [
    [labels.name, input.name],
    [labels.email, input.email],
  ]
  if (input.phone) rows.push([labels.phone, input.phone])

  const messageHtml = `<div class="panel" style="background:#faf8fc;border:1px solid #e7e1ee;border-radius:10px;padding:14px;font-size:14px;word-break:break-word;">${escape(
    input.message,
  ).replaceAll('\n', '<br>')}</div>`

  const html = renderEmailLayout({
    lang: input.lang,
    previewText: intro,
    title: subject,
    body: `<p style="margin:0 0 4px;">${escape(intro)}</p>${renderTable(rows)}${renderSection(labels.message, messageHtml)}`,
    cta: { label: labels.cta, href: messagesUrl },
    footer,
  })

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n')
  const text = renderEmailPlainText(
    subject,
    `${intro}\n\n${textRows}\n\n${labels.message}:\n${input.message}\n\n${messagesUrl}`,
    footer,
  )

  return { subject, html, text, fromName: siteName }
}
