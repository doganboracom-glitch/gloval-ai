import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildContactAckEmail, buildTicketReplyEmail, summarizeMessage } from '@/lib/email/support-mail'

const ack = {
  name: 'Ayşe Yılmaz',
  ticketNumber: 'GLV-8F4K2M',
  message: 'Sitemde alan adı bağlanmıyor.\nYardımcı olur musunuz?',
  supportEmail: 'support@gloval.ai',
}

const reply = {
  name: 'Ayşe Yılmaz',
  ticketId: '11111111-2222-3333-4444-555555555555',
  ticketNumber: 'GLV-8F4K2M',
  ticketSubject: 'İletişim formu: Ayşe Yılmaz',
  replyBody: 'Merhaba,\nAlan adınızı kontrol ettik; DNS kaydı eksikti.',
}

const PANEL_WORDING = /panel|dashboard|gösterge/i

/** Visible copy only: the shared layout's CSS legitimately has a ".panel" class. */
const visibleText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

describe('contact acknowledgement email', () => {
  it('uses the requested Turkish subject with the ticket number', () => {
    const { subject, html, text } = buildContactAckEmail({ lang: 'tr', ...ack })
    expect(subject).toBe('Talebiniz alındı (GLV-8F4K2M) | GLOVAL AI')
    for (const expected of [
      'GLV-8F4K2M',
      'Sitemde alan adı bağlanmıyor.',
      'Ek bilgi eklemek için bu e-postaya yanıt verebilirsiniz.',
      'Bu talebi siz oluşturmadıysanız bu e-postayı dikkate almayabilirsiniz.',
    ]) {
      expect(html).toContain(expected)
      expect(text).toContain(expected)
    }
  })

  it('never mentions a dashboard or links to a ticket page', () => {
    for (const lang of ['tr', 'en'] as const) {
      const { html, text } = buildContactAckEmail({ lang, ...ack })
      expect(visibleText(html)).not.toMatch(PANEL_WORDING)
      expect(text).not.toMatch(PANEL_WORDING)
      expect(html).not.toContain('/support/')
      expect(text).not.toContain('/support/')
    }
  })

  it('escapes the visitor message and the name', () => {
    const { html } = buildContactAckEmail({
      lang: 'tr',
      ...ack,
      name: '<b>Ali</b>',
      message: '<script>alert(1)</script> & "quoted"',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Ali</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('summarizes long messages to a short excerpt', () => {
    const long = 'a'.repeat(900)
    const { html } = buildContactAckEmail({ lang: 'en', ...ack, message: long })
    expect(html).not.toContain('a'.repeat(300))
    expect(summarizeMessage(long, 200)).toHaveLength(200)
    expect(summarizeMessage('  tek   satır \n\n mesaj ')).toBe('tek satır mesaj')
  })

  it('has an English variant', () => {
    const { subject, text } = buildContactAckEmail({ lang: 'en', ...ack })
    expect(subject).toBe('We received your request (GLV-8F4K2M) | GLOVAL AI')
    expect(text).toContain('simply reply to this email')
    expect(text).toContain('you can safely ignore this email')
  })
})

describe('ticket reply email', () => {
  it('guest reply has the requested subject, no dashboard wording and no ticket link', () => {
    const { subject, html, text } = buildTicketReplyEmail({ lang: 'tr', audience: 'guest', ...reply })
    expect(subject).toBe('Talebinize yanıt verildi (GLV-8F4K2M) | GLOVAL AI')
    expect(html).toContain('DNS kaydı eksikti.')
    expect(visibleText(html)).not.toMatch(PANEL_WORDING)
    expect(text).not.toMatch(PANEL_WORDING)
    expect(html).not.toContain(reply.ticketId)
    expect(text).not.toContain(reply.ticketId)
    expect(html).not.toContain('Talebi görüntüle')
  })

  it('account reply has the view button pointing at the ticket', () => {
    const { subject, html, text } = buildTicketReplyEmail({ lang: 'tr', audience: 'account', ...reply })
    expect(subject).toBe('Talebinize yanıt verildi (GLV-8F4K2M) | GLOVAL AI')
    expect(html).toContain('Talebi görüntüle')
    expect(html).toContain(`https://gloval.ai/support/${reply.ticketId}`)
    expect(text).toContain(`https://gloval.ai/support/${reply.ticketId}`)
  })

  it('escapes the admin reply and keeps line breaks', () => {
    const { html } = buildTicketReplyEmail({
      lang: 'en',
      audience: 'guest',
      ...reply,
      replyBody: 'line one\n<img src=x onerror=alert(1)>',
    })
    expect(html).toContain('line one<br>&lt;img')
    expect(html).not.toContain('<img src=x')
  })
})

describe.runIf(process.env.WRITE_EMAIL_PREVIEW)('support email preview files', () => {
  it('writes the acknowledgement and reply previews', () => {
    const dir = path.join(__dirname, '../../scripts/previews')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'contact-ack.tr.html'), buildContactAckEmail({ lang: 'tr', ...ack }).html)
    writeFileSync(path.join(dir, 'contact-ack.en.html'), buildContactAckEmail({ lang: 'en', ...ack }).html)
    writeFileSync(
      path.join(dir, 'ticket-reply.guest.tr.html'),
      buildTicketReplyEmail({ lang: 'tr', audience: 'guest', ...reply }).html,
    )
    writeFileSync(
      path.join(dir, 'ticket-reply.account.tr.html'),
      buildTicketReplyEmail({ lang: 'tr', audience: 'account', ...reply }).html,
    )
  })
})
