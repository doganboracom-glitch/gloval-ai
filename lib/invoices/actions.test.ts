import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkInvoiceLimit: vi.fn(),
  createAdminClient: vi.fn(),
  markNotRequired: vi.fn(),
  convertUploadedToNotRequired: vi.fn(),
  exportInvoicesCsv: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({ getAdminUser: mocks.getAdminUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/invoices/limit', () => ({ checkInvoiceLimit: mocks.checkInvoiceLimit }))
vi.mock('@/lib/invoices/service', () => ({
  markNotRequired: mocks.markNotRequired,
  convertUploadedToNotRequired: mocks.convertUploadedToNotRequired,
  exportInvoicesCsv: mocks.exportInvoicesCsv,
}))

import {
  convertInvoiceToNotRequiredAction,
  exportInvoicesCsvAction,
  getInvoiceDetailAction,
  markInvoicesNotRequiredAction,
} from '@/lib/invoices/actions'

const TX = '33333333-3333-4333-8333-333333333333'

const calls: Array<[string, () => Promise<unknown>]> = [
  ['markInvoicesNotRequiredAction', () => markInvoicesNotRequiredAction([TX], 'x')],
  ['convertInvoiceToNotRequiredAction', () => convertInvoiceToNotRequiredAction(TX, 'x')],
  ['exportInvoicesCsvAction', () => exportInvoicesCsvAction({})],
  ['getInvoiceDetailAction', () => getInvoiceDetailAction(TX)],
]

describe('admin invoice server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkInvoiceLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  })

  it.each(calls)('%s refuses a non-admin before touching limits, services or the database', async (_name, run) => {
    mocks.getAdminUser.mockResolvedValue(null)
    await expect(run()).resolves.toEqual({ ok: false, error: 'unauthorized' })
    expect(mocks.checkInvoiceLimit).not.toHaveBeenCalled()
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.markNotRequired).not.toHaveBeenCalled()
    expect(mocks.convertUploadedToNotRequired).not.toHaveBeenCalled()
    expect(mocks.exportInvoicesCsv).not.toHaveBeenCalled()
  })

  it.each(calls)('%s treats a failing admin lookup as signed out', async (_name, run) => {
    mocks.getAdminUser.mockRejectedValue(new Error('boom'))
    await expect(run()).resolves.toEqual({ ok: false, error: 'unauthorized' })
  })

  it('every exported action calls the guard before any other await', () => {
    const source = readFileSync(join(process.cwd(), 'lib/invoices/actions.ts'), 'utf8')
    const bodies = source.split(/^export async function /m).slice(1)
    expect(bodies.length).toBe(calls.length)
    for (const body of bodies) {
      const afterSignature = body.slice(body.indexOf('{\n', body.indexOf('Promise<')))
      expect(afterSignature.match(/await [^\n]+/)?.[0]).toMatch(/^await guard\(/)
    }
  })
})

describe('admin route handlers', () => {
  it.each(['app/api/admin/invoices/upload/route.ts', 'app/api/admin/invoices/[id]/download/route.ts'])(
    '%s resolves the admin before reading the request',
    (file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      const guardAt = source.search(/getAdminUser\(\)|requireAdminResponse\(\)/)
      expect(guardAt).toBeGreaterThan(-1)
      const firstWork = source.search(/formData\(\)|createAdminDownload\(|saveInvoice\(|checkInvoiceLimit\(/)
      expect(guardAt).toBeLessThan(firstWork)
    },
  )
})
