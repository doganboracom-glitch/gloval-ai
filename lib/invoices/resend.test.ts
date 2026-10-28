import { beforeEach, describe, expect, it, vi } from 'vitest'

const TX = '33333333-3333-4333-8333-333333333333'
const INVOICE = '22222222-2222-4222-8222-222222222222'
const SHA = 'a'.repeat(64)

const mocks = vi.hoisted(() => ({
  invoice: null as Record<string, unknown> | null,
  invoiceError: null as { message: string } | null,
  audit: vi.fn(),
  resolveRecipient: vi.fn(),
  hasActive: vi.fn(),
  enqueue: vi.fn(),
}))

vi.mock('@/lib/invoices/audit', () => ({ recordInvoiceAudit: mocks.audit }))
vi.mock('@/lib/email-outbox', () => ({
  resolveInvoiceRecipient: mocks.resolveRecipient,
  hasActiveInvoiceEmail: mocks.hasActive,
  enqueueInvoiceReadyEmail: mocks.enqueue,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: mocks.invoice, error: mocks.invoiceError }),
      }
      return builder
    },
  }),
}))

import { resendInvoiceEmail } from '@/lib/invoices/service'

const actor = { userId: 'admin-1', email: 'admin@example.com' }

describe('resendInvoiceEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.invoiceError = null
    mocks.invoice = {
      id: INVOICE,
      status: 'uploaded',
      user_id: 'user-1',
      invoice_number: 'GLV2026000042',
      file_sha256: SHA,
      billing_transaction_id: TX,
    }
    mocks.resolveRecipient.mockResolvedValue('ok')
    mocks.hasActive.mockResolvedValue(false)
    mocks.audit.mockResolvedValue(true)
    mocks.enqueue.mockResolvedValue('queued')
  })

  it('writes the audit row first, then queues a resend for the current file', async () => {
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: true, status: 'queued' })

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ actor, action: 'invoice.email_resend', invoiceId: INVOICE, billingTransactionId: TX }),
    )
    expect(mocks.enqueue).toHaveBeenCalledWith({ invoiceId: INVOICE, userId: 'user-1', fileSha256: SHA, resend: true })
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.enqueue.mock.invocationCallOrder[0])
  })

  it('sends no email when the audit row could not be written', async () => {
    mocks.audit.mockResolvedValue(false)
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'audit_failed' })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it.each(['not-a-uuid', '', null, undefined, 42, {}])('rejects the invalid id %j before any lookup', async (id) => {
    await expect(resendInvoiceEmail(actor, id)).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it.each([
    ['there is no invoice', null],
    ['the invoice is pending', { status: 'pending' }],
    ['the invoice is marked not required', { status: 'not_required' }],
    ['the invoice has no stored checksum', { file_sha256: null }],
  ])('is not_found when %s', async (_label, patch) => {
    mocks.invoice = patch === null ? null : { ...mocks.invoice, ...patch }
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'not_found' })
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('reports unavailable when the invoice cannot be read', async () => {
    mocks.invoiceError = { message: 'db down' }
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses without a recipient, before auditing', async () => {
    mocks.resolveRecipient.mockResolvedValue('no_recipient')
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'no_recipient' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses while another email for the invoice is in flight, before auditing', async () => {
    mocks.hasActive.mockResolvedValue(true)
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'email_in_progress' })
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('reports unavailable when the in-flight check throws', async () => {
    mocks.hasActive.mockRejectedValue(new Error('db down'))
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it.each([
    ['in_progress', 'email_in_progress'],
    ['no_recipient', 'no_recipient'],
    ['duplicate', 'unavailable'],
    ['failed', 'unavailable'],
  ])('maps the queue result %s to the error %s', async (queued, error) => {
    mocks.enqueue.mockResolvedValue(queued)
    await expect(resendInvoiceEmail(actor, TX)).resolves.toEqual({ ok: false, error })
  })
})
