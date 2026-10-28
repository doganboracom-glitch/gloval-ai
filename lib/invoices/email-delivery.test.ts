import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const TX = '33333333-3333-4333-8333-333333333333'
const INVOICE = '22222222-2222-4222-8222-222222222222'
const PATH = '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.pdf'

const mocks = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  invoiceError: null as { message: string } | null,
  tx: null as Record<string, unknown> | null,
  txError: null as { message: string } | null,
  download: vi.fn(),
  send: vi.fn(),
  selects: [] as Array<{ table: string; columns: string }>,
}))

vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'support@gloval.ai',
  sendTransactionalEmailDetailed: mocks.send,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ download: mocks.download }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        select: (columns: string) => {
          mocks.selects.push({ table, columns })
          return builder
        },
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve(
            table === 'invoices' ? { data: mocks.invoice, error: mocks.invoiceError } : { data: mocks.tx, error: mocks.txError },
          ),
      }
      return builder
    },
  }),
}))

import { MAX_ATTEMPTS } from '@/lib/email-outbox-policy'
import { INVOICE_MAX_BYTES } from '@/lib/invoices/constants'
import { sha256Hex } from '@/lib/invoices/pdf'
import { deliverInvoiceReady, supportTicketUrl } from '@/lib/invoices/email-delivery'

const pdf = new TextEncoder().encode('%PDF-1.4\nbody\n%%EOF')
const recipient = { email: 'ayse@example.com', lang: 'tr' as const, name: 'Ayşe' }

let sha: string
const row = (overrides: Partial<{ attempts: number; file_sha256: string | null; invoice_id: string | null }> = {}) => ({
  id: 'evt-1',
  invoice_id: INVOICE,
  file_sha256: sha,
  attempts: 1,
  ...overrides,
})

describe('deliverInvoiceReady', () => {
  beforeAll(async () => {
    sha = await sha256Hex(pdf)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selects.length = 0
    mocks.invoiceError = null
    mocks.txError = null
    mocks.invoice = {
      status: 'uploaded',
      invoice_number: 'GLV2026000042',
      invoice_date: '2026-10-28',
      amount_kurus: 19900,
      currency: 'TRY',
      file_path: PATH,
      file_sha256: sha,
      billing_transaction_id: TX,
      // Present on the row on purpose: it must never reach the email or the select list.
      billing_snapshot: { taxNumber: '1234567890', nationalId: '10000000146', address: 'Gül Mah. Lale Sok. No:5', phone: '+905321234567' },
    }
    mocks.tx = { id: TX, provider_ref: 'iyz_ref_1' }
    mocks.download.mockResolvedValue({ data: new Blob([pdf]), error: null })
    mocks.send.mockResolvedValue({ ok: true, messageId: 'msg_1' })
  })

  it('attaches the PDF and sends it to the given recipient with the event id as idempotency key', async () => {
    const outcome = await deliverInvoiceReady(row(), recipient)

    expect(outcome).toEqual({ type: 'sent', messageId: 'msg_1', attachment: { state: 'attached', reason: null } })
    expect(mocks.send).toHaveBeenCalledTimes(1)
    const sent = mocks.send.mock.calls[0][0]
    expect(sent).toMatchObject({
      to: 'ayse@example.com',
      replyTo: 'support@gloval.ai',
      idempotencyKey: 'email-event-evt-1',
      attachments: [{ filename: 'Gloval-Fatura-GLV2026000042.pdf', content: Buffer.from(pdf).toString('base64') }],
    })
    expect(sent.html).toContain('ekinde PDF olarak')
  })

  it('links the support ticket page with the billing department and invoice number', async () => {
    await deliverInvoiceReady(row(), recipient)
    const { html, text } = mocks.send.mock.calls[0][0]
    const url = 'https://gloval.ai/support/new?subject=Fatura+GLV2026000042&department=billing'
    expect(html).toContain(`href="${url.replaceAll('&', '&amp;')}"`)
    expect(text).toContain(url)
    expect(supportTicketUrl('GLV2026000042', 'en')).toBe('https://gloval.ai/support/new?subject=Invoice+GLV2026000042&department=billing')
  })

  it('never reads or mails the billing snapshot', async () => {
    await deliverInvoiceReady(row(), recipient)
    for (const { columns } of mocks.selects) expect(columns).not.toContain('billing_snapshot')
    const { html, text, subject } = mocks.send.mock.calls[0][0]
    for (const secret of ['1234567890', '10000000146', 'Gül Mah.', 'Lale Sok.', '+905321234567']) {
      expect(html).not.toContain(secret)
      expect(text).not.toContain(secret)
      expect(subject).not.toContain(secret)
    }
  })

  it.each([
    ['the file cannot be downloaded', () => mocks.download.mockResolvedValue({ data: null, error: { message: 'gone' } }), 'storage_unavailable'],
    ['the checksum differs', () => mocks.download.mockResolvedValue({ data: new Blob([new TextEncoder().encode('%PDF-other')]), error: null }), 'checksum_mismatch'],
  ])('retries instead of sending without the PDF while attempts remain (%s)', async (_label, arrange, code) => {
    arrange()
    await expect(deliverInvoiceReady(row({ attempts: 1 }), recipient)).resolves.toEqual({ type: 'retry', code })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each([
    ['the file cannot be downloaded', () => mocks.download.mockResolvedValue({ data: null, error: { message: 'gone' } }), 'storage_unavailable'],
    ['the checksum differs', () => mocks.download.mockResolvedValue({ data: new Blob([new TextEncoder().encode('%PDF-other')]), error: null }), 'checksum_mismatch'],
  ])('sends without the PDF on the last attempt and records why (%s)', async (_label, arrange, code) => {
    arrange()
    const outcome = await deliverInvoiceReady(row({ attempts: MAX_ATTEMPTS }), recipient)

    expect(outcome).toEqual({ type: 'sent', messageId: 'msg_1', attachment: { state: 'omitted', reason: code } })
    const sent = mocks.send.mock.calls[0][0]
    expect(sent.attachments).toBeUndefined()
    expect(sent.html).toContain('eklenemedi')
    expect(sent.html).not.toContain('ekinde PDF olarak')
  })

  it('omits an oversized file immediately, without waiting for the last attempt', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([new Uint8Array(INVOICE_MAX_BYTES + 1)]), error: null })
    const outcome = await deliverInvoiceReady(row({ attempts: 1 }), recipient)
    expect(outcome).toEqual({ type: 'sent', messageId: 'msg_1', attachment: { state: 'omitted', reason: 'too_large' } })
    expect(mocks.send.mock.calls[0][0].attachments).toBeUndefined()
  })

  it('treats a file path outside the invoice bucket layout as unavailable', async () => {
    mocks.invoice = { ...mocks.invoice, file_path: '../../etc/passwd' }
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'retry', code: 'storage_unavailable' })
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('gives up on an event whose file has since been replaced', async () => {
    await expect(deliverInvoiceReady(row({ file_sha256: 'f'.repeat(64) }), recipient)).resolves.toEqual({ type: 'fail', code: 'superseded' })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it.each([
    ['the invoice is no longer uploaded', { status: 'not_required' }],
    ['the invoice number is missing', { invoice_number: null }],
    ['the invoice date is missing', { invoice_date: null }],
  ])('fails permanently when %s', async (_label, patch) => {
    mocks.invoice = { ...mocks.invoice, ...patch }
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'fail', code: 'invoice_unavailable' })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('fails when the event has no invoice or checksum, and when the invoice row is gone', async () => {
    await expect(deliverInvoiceReady(row({ invoice_id: null }), recipient)).resolves.toEqual({ type: 'fail', code: 'invoice_missing' })
    await expect(deliverInvoiceReady(row({ file_sha256: null }), recipient)).resolves.toEqual({ type: 'fail', code: 'invoice_missing' })
    mocks.invoice = null
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'fail', code: 'invoice_unavailable' })
  })

  it('retries lookup errors and fails on a missing payment', async () => {
    mocks.invoiceError = { message: 'db down' }
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'retry', code: 'invoice_lookup_failed' })
    mocks.invoiceError = null
    mocks.txError = { message: 'db down' }
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'retry', code: 'transaction_lookup_failed' })
    mocks.txError = null
    mocks.tx = null
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual({ type: 'fail', code: 'transaction_missing' })
  })

  it.each([
    [{ ok: false, reason: 'not_configured' }, { type: 'defer' }],
    [{ ok: false, reason: 'http', status: 503 }, { type: 'retry', code: 'http_503' }],
    [{ ok: false, reason: 'http', status: 429 }, { type: 'retry', code: 'http_429' }],
    [{ ok: false, reason: 'http', status: 422 }, { type: 'fail', code: 'http_422' }],
    [{ ok: false, reason: 'network' }, { type: 'retry', code: 'network_error' }],
  ])('maps the provider result %j to %j', async (result, expected) => {
    mocks.send.mockResolvedValue(result)
    await expect(deliverInvoiceReady(row(), recipient)).resolves.toEqual(expected)
  })
})
