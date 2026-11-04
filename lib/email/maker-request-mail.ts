import 'server-only'

import { escape, renderEmailLayout, renderEmailPlainText, renderTable } from '@/lib/email/layout'
import type { MakerRequest } from '@/lib/maker-requests/types'

const formatBudget = (range: MakerRequest['budget_range']) => {
  const labels: Record<MakerRequest['budget_range'], string> = {
    '5000-10000': '5.000–10.000 TL',
    '10000-25000': '10.000–25.000 TL',
    '25000-plus': '25.000 TL ve üzeri',
  }
  return labels[range]
}

export function buildMakerRequestAdminEmail(request: MakerRequest) {
  const title = 'Yeni GLOVAL Maker teklif talebi'
  const links = request.reference_links.length
    ? request.reference_links.join('\n')
    : 'Bağlantı eklenmedi'
  const rows: Array<[string, string]> = [
    ['Ad soyad', request.full_name],
    ['Telefon', request.phone],
    ['E-posta', request.email],
    ['Bütçe aralığı', formatBudget(request.budget_range)],
    ['Referans siteler', links],
  ]
  const html = `<p>Yönetim panelinde yeni bir website talebi var.</p>${renderTable(rows)}`
  const text = renderEmailPlainText(
    title,
    rows.map(([label, value]) => `${label}:\n${value}`).join('\n\n'),
    'GLOVAL AI yönetim bildirimi.',
  )

  return {
    subject: title,
    html: renderEmailLayout({
      lang: 'tr',
      previewText: title,
      title,
      body: html,
      footer: 'Bu bildirim GLOVAL AI yönetim ekibi içindir.',
    }),
    text,
  }
}

export function buildMakerRequestAcknowledgementEmail(
  request: Pick<MakerRequest, 'full_name'>,
  lang: 'tr' | 'en',
) {
  const title = lang === 'tr' ? 'Talebiniz alındı' : 'Request received'
  const message = lang === 'tr'
    ? `${request.full_name}, GLOVAL Maker teklif talebinizi aldık. Ekibimiz 1 iş günü içinde sizinle iletişime geçecek.`
    : `${request.full_name}, we’ve received your GLOVAL Maker quote request. Our team will get back to you within one business day.`
  const html = `<p>${escape(message)}</p>`

  return {
    subject: lang === 'tr' ? 'GLOVAL Maker talebiniz alındı' : 'We received your GLOVAL Maker request',
    html: renderEmailLayout({
      lang,
      previewText: title,
      title,
      body: html,
      footer: lang === 'tr'
        ? 'Bu e-posta, gönderdiğiniz teklif talebi hakkında bilgi vermek için gönderildi.'
        : 'This email confirms the quote request you submitted.',
    }),
    text: renderEmailPlainText(title, message, 'GLOVAL AI'),
  }
}

export function buildMakerRequestReplyEmail({
  fullName,
  reply,
  lang,
}: {
  fullName: string
  reply: string
  lang: 'tr' | 'en'
}) {
  const title = lang === 'tr' ? 'GLOVAL Maker talebiniz hakkında' : 'About your GLOVAL Maker request'
  const greeting = lang === 'tr' ? `${fullName} merhaba,` : `Hello ${fullName},`
  const footer = lang === 'tr' ? 'GLOVAL AI ekibi' : 'The GLOVAL AI team'
  const html = `<p>${escape(greeting)}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere;">${escape(reply)}</div>`

  return {
    subject: title,
    html: renderEmailLayout({
      lang,
      previewText: title,
      title,
      body: html,
      footer,
    }),
    text: renderEmailPlainText(title, `${greeting}\n\n${reply}`, footer),
  }
}
