import { escape, renderEmailLayout, renderTable } from '@/lib/email/layout'
import type { EmailLang } from '@/lib/email/lang'

export type SupportMail = { subject: string; html: string; text: string }

export const SUPPORT_SENDER_NAME = 'GLOVAL AI Destek'
export const ACK_SUMMARY_MAX = 200

const SITE_URL = 'https://gloval.ai'

/** Absolute link to a customer ticket; only ever used in account-holder emails. */
export const ticketUrl = (ticketId: string) => `${SITE_URL}/support/${ticketId}`

/** Collapses whitespace and cuts at `max` characters (ellipsis included). */
export function summarizeMessage(message: string, max = ACK_SUMMARY_MAX): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

function greetingName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]?.slice(0, 40)
  return first ? first : null
}

const paragraph = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`

const mailLink = (address: string) =>
  `<a class="link" href="mailto:${escape(address)}" style="color:#6d43bd;text-decoration:underline;">${escape(address)}</a>`

/** Escapes first, then turns line breaks into <br>, so user text can never inject markup. */
function escapeWithBreaks(value: string): string {
  return escape(value.replace(/\r\n?/g, '\n').trim()).replaceAll('\n', '<br>')
}

function quoteBlock(label: string | null, innerHtml: string): string {
  const heading = label
    ? `<p class="muted" style="margin:0 0 6px;color:#6b6473;font-size:13px;font-weight:700;">${escape(label)}</p>`
    : ''
  return `${heading}<blockquote class="panel" style="margin:0 0 18px;padding:12px 16px;border-left:3px solid #A36FFA;background:#faf8fc;color:#241f2b;font-size:15px;line-height:1.55;">${innerHtml}</blockquote>`
}

/* --------------------------------- ack mail -------------------------------- */

const ACK_COPY = {
  tr: {
    subject: (no: string) => `Talebiniz alındı (${no}) | GLOVAL AI`,
    preview: 'Talebiniz bize ulaştı. Teknik ekibimiz en kısa sürede size e-posta ile dönüş yapacak.',
    title: 'Talebiniz alındı',
    hello: (name: string | null) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    thanks:
      'Bize yazdığınız için teşekkür ederiz. Talebiniz kaydedildi; teknik ekibimiz inceleyip en kısa sürede size e-posta ile dönüş yapacak.',
    ticketNo: 'Talep numarası',
    yourMessage: 'Gönderdiğiniz mesaj',
    addInfo: 'Ek bilgi eklemek için bu e-postaya yanıt verebilirsiniz.',
    notYou: 'Bu talebi siz oluşturmadıysanız bu e-postayı dikkate almayabilirsiniz.',
    footer: 'Bu e-posta, gloval.ai iletişim formundan bir talep gönderildiği için gönderildi.',
  },
  en: {
    subject: (no: string) => `We received your request (${no}) | GLOVAL AI`,
    preview: 'Your request has reached us. Our technical team will review it and email you shortly.',
    title: 'We received your request',
    hello: (name: string | null) => (name ? `Hello ${name},` : 'Hello,'),
    thanks:
      'Thank you for writing to us. Your request has been recorded; our technical team will review it and get back to you by email as soon as possible.',
    ticketNo: 'Request number',
    yourMessage: 'Your message',
    addInfo: 'To add more information, simply reply to this email.',
    notYou: 'If you did not create this request, you can safely ignore this email.',
    footer: 'This email was sent because a request was submitted through the gloval.ai contact form.',
  },
} satisfies Record<EmailLang, unknown>

export function buildContactAckEmail(input: {
  lang: EmailLang
  name?: string | null
  ticketNumber: string
  message: string
  supportEmail: string
}): SupportMail {
  const c = ACK_COPY[input.lang]
  const hello = c.hello(greetingName(input.name))
  const summary = summarizeMessage(input.message)

  const body = [
    paragraph(escape(hello)),
    paragraph(escape(c.thanks)),
    renderTable([[c.ticketNo, input.ticketNumber]]),
    quoteBlock(c.yourMessage, escape(summary)),
    paragraph(`${escape(c.addInfo)} (${mailLink(input.supportEmail)})`),
    paragraph(escape(c.notYou)),
  ].join('')

  const html = renderEmailLayout({
    lang: input.lang,
    previewText: c.preview,
    title: c.title,
    body,
    footer: c.footer,
  })

  const text = [
    hello,
    '',
    c.thanks,
    '',
    `${c.ticketNo}: ${input.ticketNumber}`,
    '',
    `${c.yourMessage}:`,
    summary,
    '',
    `${c.addInfo} (${input.supportEmail})`,
    c.notYou,
    '',
    c.footer,
    SITE_URL,
  ].join('\n')

  return { subject: c.subject(input.ticketNumber), html, text }
}

/* -------------------------------- reply mail -------------------------------- */

const REPLY_COPY = {
  tr: {
    subject: (no: string) => `Talebinize yanıt verildi (${no}) | GLOVAL AI`,
    preview: 'Destek ekibimiz talebinize yanıt verdi.',
    title: 'Talebinize yanıt verildi',
    hello: (name: string | null) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    intro: 'Destek ekibimiz talebinize aşağıdaki yanıtı verdi:',
    ticketNo: 'Talep numarası',
    originalSubject: 'Konu',
    continueByMail:
      'Bu e-postayı yanıtlayarak bizimle yazışmaya devam edebilirsiniz (lütfen talep numarasını konuda tutun).',
    followInPanel: 'Talebinizi panelinizden de takip edebilirsiniz.',
    cta: 'Talebi görüntüle',
    footer: 'Bu e-posta, GLOVAL AI destek ekibi talebinize yanıt verdiği için gönderildi.',
  },
  en: {
    subject: (no: string) => `Your request has a reply (${no}) | GLOVAL AI`,
    preview: 'Our support team has replied to your request.',
    title: 'Your request has a reply',
    hello: (name: string | null) => (name ? `Hello ${name},` : 'Hello,'),
    intro: 'Our support team replied to your request:',
    ticketNo: 'Request number',
    originalSubject: 'Subject',
    continueByMail:
      'You can keep writing to us by replying to this email (please keep the request number in the subject).',
    followInPanel: 'You can also follow your request from your dashboard.',
    cta: 'View request',
    footer: 'This email was sent because the GLOVAL AI support team replied to your request.',
  },
} satisfies Record<EmailLang, unknown>

export type TicketReplyMailInput = {
  lang: EmailLang
  /** `account` is decided on the server from the ticket owner; `guest` never gets any dashboard wording or link. */
  audience: 'guest' | 'account'
  name?: string | null
  ticketId: string
  ticketNumber: string
  ticketSubject: string
  replyBody: string
}

export function buildTicketReplyEmail(input: TicketReplyMailInput): SupportMail {
  const c = REPLY_COPY[input.lang]
  const account = input.audience === 'account'
  const hello = c.hello(greetingName(input.name))
  const href = ticketUrl(input.ticketId)

  const body = [
    paragraph(escape(hello)),
    paragraph(escape(c.intro)),
    quoteBlock(null, escapeWithBreaks(input.replyBody)),
    renderTable([
      [c.ticketNo, input.ticketNumber],
      [c.originalSubject, input.ticketSubject],
    ]),
    paragraph(escape(c.continueByMail)),
    account ? paragraph(escape(c.followInPanel)) : '',
  ].join('')

  const html = renderEmailLayout({
    lang: input.lang,
    previewText: c.preview,
    title: c.title,
    body,
    cta: account ? { label: c.cta, href } : undefined,
    footer: c.footer,
  })

  const text = [
    hello,
    '',
    c.intro,
    '',
    input.replyBody.trim(),
    '',
    `${c.ticketNo}: ${input.ticketNumber}`,
    `${c.originalSubject}: ${input.ticketSubject}`,
    '',
    c.continueByMail,
    ...(account ? [c.followInPanel, `${c.cta}: ${href}`] : []),
    '',
    c.footer,
    SITE_URL,
  ].join('\n')

  return { subject: c.subject(input.ticketNumber), html, text }
}
