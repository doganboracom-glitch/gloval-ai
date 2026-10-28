import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
const INVOICE = '22222222-2222-4222-8222-222222222222'
const TX = '33333333-3333-4333-8333-333333333333'
const FILE = `${USER}/44444444-4444-4444-8444-444444444444.pdf`

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  sign: vi.fn(),
  stored: null as unknown,
  getUser: vi.fn(),
  rls: null as unknown,
  limit: vi.fn(),
  download: vi.fn(),
}))

vi.mock('@/lib/invoices/audit', () => ({ recordInvoiceAudit: mocks.audit }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: mocks.stored, error: null }),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: mocks.rls }),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/invoices/limit', () => ({ checkInvoiceLimit: mocks.limit }))

import { createCustomerDownload } from '@/lib/invoices/service'

const actor = { userId: USER, email: 'a@example.com' }
const owned = { id: INVOICE, user_id: USER, billing_transaction_id: TX, status: 'uploaded' }

describe('createCustomerDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.audit.mockResolvedValue(true)
    mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/f.pdf' }, error: null })
    mocks.stored = { invoice_number: 'GLV-1', file_path: FILE, user_id: USER }
  })

  it('issues a 60 second link and audits invoice.download_customer', async () => {
    await expect(createCustomerDownload(actor, owned)).resolves.toEqual({ ok: true, url: 'https://signed.example/f.pdf' })
    expect(mocks.sign).toHaveBeenCalledWith(FILE, 60, expect.anything())
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.download_customer', invoiceId: INVOICE }))
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.sign.mock.invocationCallOrder[0])
  })

  it('answers not_found without signing or auditing for someone else’s invoice', async () => {
    await expect(createCustomerDownload(actor, { ...owned, user_id: OTHER })).resolves.toEqual({ ok: false, error: 'not_found' })
    mocks.stored = { invoice_number: 'GLV-1', file_path: FILE, user_id: OTHER }
    await expect(createCustomerDownload(actor, owned)).resolves.toEqual({ ok: false, error: 'not_found' })
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('does not serve not_required rows, missing files or archived files', async () => {
    await expect(createCustomerDownload(actor, { ...owned, status: 'not_required' })).resolves.toEqual({ ok: false, error: 'not_found' })
    mocks.stored = { invoice_number: 'GLV-1', file_path: null, user_id: USER }
    await expect(createCustomerDownload(actor, owned)).resolves.toEqual({ ok: false, error: 'not_found' })
    mocks.stored = { invoice_number: 'GLV-1', file_path: `_archived/${INVOICE}-1790000000.pdf`, user_id: USER }
    await expect(createCustomerDownload(actor, owned)).resolves.toEqual({ ok: false, error: 'not_found' })
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('refuses the link when the audit row cannot be written', async () => {
    mocks.audit.mockResolvedValue(false)
    await expect(createCustomerDownload(actor, owned)).resolves.toEqual({ ok: false, error: 'audit_failed' })
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})

describe('GET /api/invoices/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'a@example.com' } } })
    mocks.rls = owned
    mocks.download.mockReset()
  })

  const call = async (id: string) => {
    const { GET } = await import('@/app/api/invoices/[id]/download/route')
    return GET(new Request('http://localhost/x'), { params: Promise.resolve({ id }) })
  }

  it('requires a session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const response = await call(INVOICE)
    expect(response.status).toBe(401)
    expect(mocks.limit).not.toHaveBeenCalled()
  })

  it('returns an identical 404 for malformed, unknown and foreign ids', async () => {
    const malformed = await call('not-a-uuid')
    mocks.rls = null
    const foreign = await call(INVOICE)
    expect(malformed.status).toBe(404)
    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toEqual(await malformed.json())
  })

  it('redirects an owner to the 60 second signed URL without caching', async () => {
    mocks.stored = { invoice_number: 'GLV-1', file_path: FILE, user_id: USER }
    mocks.audit.mockResolvedValue(true)
    mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://signed.example/f.pdf' }, error: null })
    const response = await call(INVOICE)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://signed.example/f.pdf')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
