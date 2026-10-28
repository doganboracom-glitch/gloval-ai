import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPaymentReceiptEmail } from '@/lib/email/payment-receipt'
import { formatReceiptAmount, formatReceiptDate, type PaymentReceiptCopyInput } from '@/lib/email/payment-receipt-copy'

const base: PaymentReceiptCopyInput = {
  kind: 'ai_topup',
  lang: 'tr',
  credits: 50,
  amountCents: 19900,
  currency: 'TRY',
  paidAt: new Date('2026-10-28T09:15:00Z'),
  ticketNumber: 'GLV-8F4K2M',
  supportEmail: 'support@gloval.ai',
  billingUrl: 'https://gloval.ai/billing',
}

describe('AI add-on payment receipt email', () => {
  it('renders every field of the summary card in Turkish', () => {
    const { subject, html, text } = buildPaymentReceiptEmail(base)
    expect(subject).toBe('Ödeme başarılı — AI işlemleri eklendi')
    for (const expected of [
      'Ödemen alındı',
      'Ek AI paketi: +50 AI işlemi',
      '50 AI işlemi',
      '₺199 (KDV dahil)',
      '28 Ekim 2026',
      'GLV-8F4K2M',
      'iyzico güvenli ödeme',
      'Faturalandırmayı görüntüle',
      'support@gloval.ai',
    ]) {
      expect(html).toContain(expected)
      expect(text).toContain(expected)
    }
  })

  it('uses the shared layout: table structure, 600px card, logo, footer, dark mode', () => {
    const { html } = buildPaymentReceiptEmail(base)
    expect(html).toContain('max-width:600px')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('https://gloval.ai/logo.png')
    expect(html).toContain('alt="GLOVAL AI"')
    expect(html).toContain('prefers-color-scheme:dark')
    expect(html).toContain('Bu e-posta ek AI paketi ödemen onaylandığı için gönderildi.')
    expect(html).not.toMatch(/color:#(000|000000|fff|ffffff)\b(?=[^>]*font-size:1[45]px)/i)
  })

  it('links the button and support address with absolute URLs', () => {
    const { html, text } = buildPaymentReceiptEmail(base)
    expect(html).toContain('href="https://gloval.ai/billing"')
    expect(html).toContain('href="mailto:support@gloval.ai"')
    expect(text).toContain('Faturalandırmayı görüntüle: https://gloval.ai/billing')
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).toMatch(/^(https:\/\/|mailto:)/)
  })

  it('never mentions card details or an invoice process that does not exist', () => {
    const { html, text } = buildPaymentReceiptEmail(base)
    for (const output of [html, text]) {
      expect(output).not.toMatch(/e-?arşiv|e-?archive|fatura(n)? .*gönderil|invoice will/i)
      expect(output).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/)
    }
  })

  it('adds the billing-profile reminder only while the profile is incomplete', () => {
    const complete = buildPaymentReceiptEmail(base)
    const incomplete = buildPaymentReceiptEmail({ ...base, billingProfileIncomplete: true })
    expect(complete.html).not.toContain('#fatura-bilgileri')
    expect(incomplete.html).toContain('href="https://gloval.ai/billing#fatura-bilgileri"')
    expect(incomplete.text).toContain('https://gloval.ai/billing#fatura-bilgileri')
  })

  it('renders English with the amount and date in the recipient format', () => {
    const { subject, html, text } = buildPaymentReceiptEmail({ ...base, lang: 'en', amountCents: 34900, credits: 100 })
    expect(subject).toBe('Payment successful — AI credits added')
    expect(html).toContain('<html lang="en">')
    for (const expected of ['Payment received', '₺349 (VAT included)', 'October 28, 2026', 'AI add-on pack: +100 AI credits', 'View billing']) {
      expect(html).toContain(expected)
      expect(text).toContain(expected)
    }
  })

  it('formats amounts and dates per language, including decimals and unknown currencies', () => {
    expect(formatReceiptAmount(19900, 'TRY', 'tr')).toBe('₺199')
    expect(formatReceiptAmount(19950, 'try', 'en')).toBe('₺199.50')
    expect(formatReceiptAmount(19950, 'TRY', 'tr')).toBe('₺199,50')
    expect(formatReceiptAmount(1000, '??', 'en')).toBe('10.00 ??')
    expect(formatReceiptDate(new Date('2026-10-28T09:15:00Z'), 'tr')).toContain('12:15')
    expect(formatReceiptDate(new Date('nope'), 'tr')).toBe('')
  })

  it('escapes every user-influenced field', () => {
    const payload = '<script>alert("x")</script>'
    const { html } = buildPaymentReceiptEmail({
      ...base,
      ticketNumber: payload,
      supportEmail: payload,
      billingUrl: `https://gloval.ai/billing"><img src=x onerror=alert(1)>`,
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  })

  it('keeps the top-up fulfilment contract: subject, log type and no dedupe key change', () => {
    const source = readFileSync(path.join(__dirname, '../payments/topup-fulfillment.ts'), 'utf8')
    expect(source).toContain("type: 'payment_succeeded'")
    expect(source).toContain("subject: 'Ödeme başarılı — AI işlemleri eklendi'")
    expect(source).toContain('includeBillingProfileReminder: true')
    expect(source).not.toContain('dedupeKey')
  })
})

describe.runIf(process.env.WRITE_EMAIL_PREVIEW)('email preview files', () => {
  it('writes the Turkish and English receipt previews', () => {
    const dir = path.join(__dirname, '../../scripts/previews')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'payment-receipt-ai-topup.tr.html'), buildPaymentReceiptEmail({ ...base, billingProfileIncomplete: true }).html)
    writeFileSync(path.join(dir, 'payment-receipt-ai-topup.en.html'), buildPaymentReceiptEmail({ ...base, lang: 'en' }).html)
  })
})
