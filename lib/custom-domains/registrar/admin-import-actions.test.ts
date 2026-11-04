import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  identityFor: vi.fn(),
  reserve: vi.fn(),
  preview: vi.fn(),
  request: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}))

vi.mock('@/lib/mail/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/custom-domains/public-search/limits', () => ({
  identityFor: mocks.identityFor,
  rpcLimiter: { reserve: mocks.reserve },
}))
vi.mock('./admin-import-service', () => ({
  previewRegistrarDomainImport: mocks.preview,
  requestRegistrarDomainImport: mocks.request,
  approveRegistrarDomainImport: mocks.approve,
  rejectRegistrarDomainImport: mocks.reject,
}))

import {
  approveRegistrarDomainImportAction,
  previewRegistrarDomainImportAction,
  rejectRegistrarDomainImportAction,
  requestRegistrarDomainImportAction,
} from './admin-import-actions'

describe('admin registrar import actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.identityFor.mockReturnValue({ key: 'hashed-admin-identity' })
    mocks.reserve.mockResolvedValue({ allowed: true })
  })

  it('requires an admin before rate limiting or invoking any import operation', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('not authorized'))

    await expect(previewRegistrarDomainImportAction('domain.example')).rejects.toThrow('not authorized')
    await expect(
      requestRegistrarDomainImportAction({
        domain: 'domain.example',
        targetEmail: 'person@example.net',
        reason: 'TKT-2026-120',
        idempotencyKey: 'request-key-1',
      }),
    ).rejects.toThrow('not authorized')
    await expect(approveRegistrarDomainImportAction('00000000-0000-0000-0000-000000000001')).rejects.toThrow(
      'not authorized',
    )
    await expect(
      rejectRegistrarDomainImportAction({
        requestId: '00000000-0000-0000-0000-000000000001',
        note: 'Duplicate request',
      }),
    ).rejects.toThrow('not authorized')

    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.reject).not.toHaveBeenCalled()
  })

  it('rejects malformed input before calling the registrar or database service', async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin-1', email: 'admin@example.net' })

    await expect(previewRegistrarDomainImportAction('x'.repeat(301))).resolves.toMatchObject({
      ok: false,
      error: 'invalid_domain',
    })
    await expect(
      requestRegistrarDomainImportAction({
        domain: 'domain.example',
        targetEmail: 'x'.repeat(255),
        reason: 'TKT-2026-120',
        idempotencyKey: 'request-key-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid_email' })
    await expect(approveRegistrarDomainImportAction('not-a-uuid')).resolves.toMatchObject({
      ok: false,
      error: 'request_not_found',
    })

    expect(mocks.reserve).toHaveBeenCalledTimes(3)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })
})
