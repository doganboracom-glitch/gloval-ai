import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INVOICE_ID = '22222222-2222-4222-8222-222222222222'
const TX_ID = '33333333-3333-4333-8333-333333333333'
const FILE_PATH = `${USER_ID}/44444444-4444-4444-8444-444444444444.pdf`

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  audit: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  current: null as unknown,
  updateResult: { data: [{ id: 'x' }], error: null } as { data: unknown; error: { message: string } | null },
  updatePayload: null as unknown,
}))

vi.mock('@/lib/invoices/audit', () => ({ recordInvoiceAudit: mocks.audit }))
vi.mock('@/lib/invoices/limit', () => ({ checkInvoiceLimit: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ move: mocks.move, remove: mocks.remove }) },
    from: () => {
      let isUpdate = false
      const builder: Record<string, unknown> = {
        select: () => (isUpdate ? Promise.resolve(((mocks.events.push('row.update'), mocks.updateResult))) : builder),
        update: (payload: unknown) => ((isUpdate = true), (mocks.updatePayload = payload), builder),
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: mocks.current, error: null }),
      }
      return builder
    },
  }),
}))

import { convertUploadedToNotRequired } from '@/lib/invoices/service'

const actor = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@example.com' }

beforeEach(() => {
  mocks.events.length = 0
  mocks.audit.mockReset()
  mocks.move.mockReset()
  mocks.remove.mockReset()
  mocks.updatePayload = null
  mocks.updateResult = { data: [{ id: INVOICE_ID }], error: null }
  mocks.current = {
    id: INVOICE_ID,
    status: 'uploaded',
    invoice_number: 'GLV2026000001',
    invoice_date: '2026-10-01',
    file_path: FILE_PATH,
    file_sha256: 'a'.repeat(64),
  }
  mocks.audit.mockImplementation(async (entry: { detail?: { outcome?: string } }) => {
    mocks.events.push(`audit:${entry.detail?.outcome ?? 'none'}`)
    return true
  })
  mocks.move.mockImplementation(async (from: string, to: string) => {
    mocks.events.push(`move:${from === FILE_PATH ? 'archive' : 'restore'}`)
    void to
    return { error: null }
  })
})

describe('convertUploadedToNotRequired', () => {
  it('audits first, moves the PDF into _archived, then updates the row, and never deletes the file', async () => {
    const result = await convertUploadedToNotRequired(actor, TX_ID, 'Yanlis yukleme')
    expect(result).toEqual({ ok: true })
    expect(mocks.events).toEqual(['audit:attempt', 'move:archive', 'row.update'])
    expect(mocks.remove).not.toHaveBeenCalled()

    const [from, to] = mocks.move.mock.calls[0] as [string, string]
    expect(from).toBe(FILE_PATH)
    expect(to).toMatch(new RegExp(`^_archived/${INVOICE_ID}-\\d{10}\\.pdf$`))

    const detail = (mocks.audit.mock.calls[0][0] as { detail: Record<string, unknown> }).detail
    expect(detail.archivePath).toBe(to)
    expect(detail.previousInvoiceNumber).toBe('GLV2026000001')
    expect(detail.previousSha256).toBe('a'.repeat(64))
    expect(mocks.updatePayload).toMatchObject({ status: 'not_required', file_path: null, invoice_number: null })
  })

  it('refuses without an audit trail and touches neither file nor row', async () => {
    mocks.audit.mockImplementation(async () => false)
    const result = await convertUploadedToNotRequired(actor, TX_ID, 'Yanlis yukleme')
    expect(result).toEqual({ ok: false, error: 'audit_failed' })
    expect(mocks.move).not.toHaveBeenCalled()
    expect(mocks.events).not.toContain('row.update')
  })

  it('stops when the archive move fails: row unchanged, abort audited', async () => {
    mocks.move.mockImplementation(async () => ({ error: { message: 'boom' } }))
    const result = await convertUploadedToNotRequired(actor, TX_ID, 'Yanlis yukleme')
    expect(result).toEqual({ ok: false, error: 'storage_failed' })
    expect(mocks.events).not.toContain('row.update')
    expect(mocks.updatePayload).toBeNull()
    expect(mocks.events).toEqual(['audit:attempt', 'audit:aborted_archive_failed'])
  })

  it('moves the PDF back when the row update fails', async () => {
    mocks.updateResult = { data: null, error: { message: 'db down' } }
    const result = await convertUploadedToNotRequired(actor, TX_ID, 'Yanlis yukleme')
    expect(result).toEqual({ ok: false, error: 'save_failed' })
    expect(mocks.events).toEqual(['audit:attempt', 'move:archive', 'row.update', 'move:restore', 'audit:aborted_save_failed'])
    const [archived, restored] = [mocks.move.mock.calls[0][1], mocks.move.mock.calls[1]]
    expect(restored).toEqual([archived, FILE_PATH])
  })

  it('rejects invoices that are not uploaded or reasons that are too short', async () => {
    expect(await convertUploadedToNotRequired(actor, TX_ID, 'x')).toEqual({ ok: false, error: 'invalid_reason' })
    mocks.current = { ...(mocks.current as object), status: 'not_required' }
    expect(await convertUploadedToNotRequired(actor, TX_ID, 'Yanlis yukleme')).toEqual({ ok: false, error: 'not_found' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
