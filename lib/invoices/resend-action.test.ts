import { beforeEach, describe, expect, it, vi } from 'vitest'

const TX = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkInvoiceLimit: vi.fn(),
  resendInvoiceEmail: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/mail/admin-guard', () => ({ getAdminUser: mocks.getAdminUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/invoices/limit', () => ({ checkInvoiceLimit: mocks.checkInvoiceLimit }))
vi.mock('@/lib/invoices/service', () => ({
  markNotRequired: vi.fn(),
  convertUploadedToNotRequired: vi.fn(),
  reopenNotRequired: vi.fn(),
  resendInvoiceEmail: mocks.resendInvoiceEmail,
  exportInvoicesCsv: vi.fn(),
}))

import { resendInvoiceEmailAction } from '@/lib/invoices/actions'

const admin = { userId: 'admin-1', email: 'admin@example.com' }

describe('resendInvoiceEmailAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAdminUser.mockResolvedValue(admin)
    mocks.checkInvoiceLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    mocks.resendInvoiceEmail.mockResolvedValue({ ok: true, status: 'queued' })
  })

  it('refuses a non-admin without touching the limiter or the service', async () => {
    mocks.getAdminUser.mockResolvedValue(null)
    await expect(resendInvoiceEmailAction(TX)).resolves.toEqual({ ok: false, error: 'unauthorized' })
    expect(mocks.checkInvoiceLimit).not.toHaveBeenCalled()
    expect(mocks.resendInvoiceEmail).not.toHaveBeenCalled()
  })

  it('is rate limited per admin before sending anything', async () => {
    mocks.checkInvoiceLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 })
    await expect(resendInvoiceEmailAction(TX)).resolves.toEqual({ ok: false, error: 'rate_limited' })
    expect(mocks.checkInvoiceLimit).toHaveBeenCalledWith('admin-1', 'write')
    expect(mocks.resendInvoiceEmail).not.toHaveBeenCalled()
  })

  it('passes the signed-in admin to the service and refreshes the invoice list on success', async () => {
    await expect(resendInvoiceEmailAction(TX)).resolves.toEqual({ ok: true })
    expect(mocks.resendInvoiceEmail).toHaveBeenCalledWith(admin, TX)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/billing/invoices')
  })

  it('returns the service error and leaves the list alone on failure', async () => {
    mocks.resendInvoiceEmail.mockResolvedValue({ ok: false, error: 'email_in_progress' })
    await expect(resendInvoiceEmailAction(TX)).resolves.toEqual({ ok: false, error: 'email_in_progress' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
