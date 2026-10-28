import { describe, expect, it } from 'vitest'
import { buildInvoiceReadyEmail, formatInvoiceDate, type InvoiceReadyInput } from '@/lib/email/invoice-ready'

const base: InvoiceReadyInput = {
  lang: 'tr',
  name: 'Ayşe Yılmaz',
  invoiceNumber: 'GLV2026000042',
  invoiceDate: '2026-10-28',
  amountKurus: 19900,
  currency: 'TRY',
  transactionNumber: 'GLV-8F4K2M',
  attachmentIncluded: true,
  billingUrl: 'https://gloval.ai/billing',
  supportTicketUrl: 'https://gloval.ai/support/new?department=billing&subject=Fatura+GLV2026000042',
  supportEmail: 'support@gloval.ai',
}

describe('invoice ready email', () => {
  it('renders every field in Turkish, in both html and text', () => {
    const { subject, html, text } = buildInvoiceReadyEmail(base)
    expect(subject).toBe('Faturanız hazır — GLOVAL AI')
    for (const expected of [
      'Faturanız hazır',
      'Merhaba Ayşe Yılmaz,',
      'GLV2026000042',
      '28 Ekim 2026',
      '₺199 (KDV dahil)',
      'GLV-8F4K2M',
      'ekinde PDF olarak',
      'Faturalandırmayı görüntüle',
      'support@gloval.ai',
    ]) {
      expect(html).toContain(expected)
      expect(text).toContain(expected)
    }
  })

  it('renders English', () => {
    const { subject, html } = buildInvoiceReadyEmail({ ...base, lang: 'en' })
    expect(subject).toBe('Your invoice is ready — GLOVAL AI')
    expect(html).toContain('<html lang="en">')
    for (const expected of ['Hi Ayşe Yılmaz,', 'October 28, 2026', '₺199 (VAT included)', 'attached to this email', 'View billing']) {
      expect(html).toContain(expected)
    }
  })

  it('points to the billing page instead of the attachment when the PDF could not be attached', () => {
    const { html, text } = buildInvoiceReadyEmail({ ...base, attachmentIncluded: false })
    for (const output of [html, text]) {
      expect(output).toContain('eklenemedi')
      expect(output).not.toContain('ekinde PDF olarak')
    }
  })

  it('omits the greeting when there is no name and uses only absolute links', () => {
    const { html } = buildInvoiceReadyEmail({ ...base, name: '  ' })
    expect(html).not.toContain('Merhaba')
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^(https:\/\/|mailto:)/)
  })

  it('escapes every user-influenced field', () => {
    const payload = '<script>alert("x")</script>'
    const { html } = buildInvoiceReadyEmail({
      ...base,
      name: payload,
      invoiceNumber: payload,
      transactionNumber: payload,
      billingUrl: 'https://gloval.ai/billing"><img src=x onerror=alert(1)>',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it('links "destek talebi oluşturun" to the absolute ticket URL and offers the support address as the second option', () => {
    const { html, text } = buildInvoiceReadyEmail(base)
    expect(html).toContain(`href="${base.supportTicketUrl.replaceAll('&', '&amp;')}"`)
    expect(html).toMatch(/>destek talebi oluşturun<\/a> veya bize e-posta ile yazın: <a [^>]*href="mailto:support@gloval\.ai"[^>]*>support@gloval\.ai<\/a>/)
    expect(text).toContain(`destek talebi oluşturun: ${base.supportTicketUrl}`)
    expect(text).toContain('veya bize e-posta ile yazın: support@gloval.ai')
  })

  it('renders the same two support options in English', () => {
    const { html, text } = buildInvoiceReadyEmail({ ...base, lang: 'en' })
    expect(html).toMatch(/>create a support ticket<\/a> or write to us at <a [^>]*href="mailto:support@gloval\.ai"/)
    expect(text).toContain(`create a support ticket: ${base.supportTicketUrl}`)
  })

  it('carries only invoice facts: no tax number, national id, address or phone', () => {
    for (const lang of ['tr', 'en'] as const) {
      const { html, text } = buildInvoiceReadyEmail({ ...base, lang })
      for (const output of [html, text]) {
        expect(output).not.toMatch(/\b\d{10,11}\b/)
        expect(output).not.toMatch(/TCKN|VKN|Vergi|Tax (number|office)|Mah\.|Sok\.|Cad\./i)
        expect(output).not.toMatch(/\+?90\s?5\d{2}/)
      }
    }
  })

  it('formats the invoice date per language and leaves malformed input untouched', () => {
    expect(formatInvoiceDate('2026-01-05', 'tr')).toBe('5 Ocak 2026')
    expect(formatInvoiceDate('2026-01-05', 'en')).toBe('January 5, 2026')
    expect(formatInvoiceDate('05.01.2026', 'tr')).toBe('05.01.2026')
  })
})
