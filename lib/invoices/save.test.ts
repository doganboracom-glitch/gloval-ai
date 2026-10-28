import { beforeEach, describe, expect, it, vi } from 'vitest'

const TX = '33333333-3333-4333-8333-333333333333'
const INVOICE = '22222222-2222-4222-8222-222222222222'
const OLD_PATH = '11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.pdf'

type Result = { data?: unknown; error?: { message: string } | null }

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  issue: vi.fn(),
  tx: null as unknown,
  existing: null as unknown,
  clash: [] as unknown[],
  update: { error: null } as { error: { message: string } | null },
  insert: { data: { id: '22222222-2222-4222-8222-222222222222' }, error: null } as Result,
}))

vi.mock('@/lib/invoices/audit', () => ({ recordInvoiceAudit: mocks.audit }))
vi.mock('@/lib/invoices/provider', () => ({ getInvoiceProvider: () => ({ issue: mocks.issue }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    from: (table: string) => {
      let op: 'select' | 'update' | 'insert' = 'select'
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        ilike: () => builder,
        limit: () => builder,
        update: () => ((op = 'update'), builder),
        insert: () => ((op = 'insert'), builder),
        single: () => Promise.resolve(mocks.insert),
        maybeSingle: () => Promise.resolve({ data: table === 'billing_transactions' ? mocks.tx : table === 'invoices' ? mocks.existing : null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(op === 'update' ? mocks.update : { data: mocks.clash }).then(resolve, reject),
      }
      return builder
    },
  }),
}))

import { saveInvoice } from '@/lib/invoices/service'

const pdf = new TextEncoder().encode('%PDF-1.4\nbody\n%%EOF')
const input = {
  actor: { userId: 'admin-1', email: 'admin@example.com' },
  transactionId: TX,
  invoiceNumber: 'GLV-2026-1',
  invoiceDate: '2026-10-01',
  fileBytes: pdf,
  fileName: '../../evil<name>.pdf',
  refreshSnapshot: false,
}

describe('saveInvoice failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tx = { id: TX, user_id: null, kind: 'charge', amount_cents: 12000, currency: 'TRY', status: 'succeeded', provider: 'iyzico', provider_ref: null, description: null, idempotency_key: 'sub_1', created_at: '2026-10-01T10:00:00Z' }
    mocks.existing = { id: INVOICE, status: 'uploaded', file_path: OLD_PATH, billing_snapshot: { a: 1 }, invoice_number: 'OLD-1' }
    mocks.clash = []
    mocks.update = { error: null }
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.issue.mockResolvedValue({ source: 'manual', providerRef: null })
    mocks.audit.mockResolvedValue(true)
  })

  it('rejects a non-PDF on the server before anything is stored', async () => {
    const result = await saveInvoice({ ...input, fileBytes: new TextEncoder().encode('<html></html>') })
    expect(result).toEqual({ ok: false, error: 'unsupported_type' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects a duplicate number before uploading', async () => {
    mocks.clash = [{ id: 'another-invoice' }]
    await expect(saveInvoice(input)).resolves.toEqual({ ok: false, error: 'number_taken' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('keeps the old file and removes the new one when the row update fails', async () => {
    mocks.update = { error: { message: 'duplicate key value violates unique constraint "invoices_number_uidx"' } }
    await expect(saveInvoice(input)).resolves.toEqual({ ok: false, error: 'number_taken' })
    const newPath = mocks.upload.mock.calls[0][0] as string
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(mocks.remove).toHaveBeenCalledWith([newPath])
    expect(mocks.remove).not.toHaveBeenCalledWith([OLD_PATH])
  })

  it('keeps the old file and removes the new one when something throws after the upload', async () => {
    mocks.issue.mockRejectedValue(new Error('integrator down'))
    await expect(saveInvoice(input)).resolves.toEqual({ ok: false, error: 'save_failed' })
    const newPath = mocks.upload.mock.calls[0][0] as string
    expect(mocks.remove).toHaveBeenCalledWith([newPath])
    expect(mocks.remove).not.toHaveBeenCalledWith([OLD_PATH])
  })

  it('deletes the old file only after the row points at the new one, and stores a sanitised name', async () => {
    await expect(saveInvoice(input)).resolves.toEqual({ ok: true, invoiceId: INVOICE, replaced: true })
    expect(mocks.remove).toHaveBeenCalledWith([OLD_PATH])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.replace' }))
  })
})
