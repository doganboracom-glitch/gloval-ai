import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DomainAuditDetails, DomainAuditReason } from './audit'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { recordDomainAuditEvent } from './audit'

const allowedReasons: DomainAuditReason[] = [
  'locked_unreadable',
  'status_unknown',
  'start_date_missing',
  'start_date_unparseable',
]

function setupInsert() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn(() => ({ insert }))
  mocks.createAdminClient.mockReturnValue({ from })
  return insert
}

describe('recordDomainAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(allowedReasons)('stores the safe diagnostic reason %s', async (reason) => {
    const insert = setupInsert()

    await recordDomainAuditEvent({
      userId: 'user-id',
      customDomainId: 'domain-id',
      domain: 'example.com',
      eventType: 'transfer_code_viewed',
      details: { outcome: 'failed', reason },
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      details: { outcome: 'failed', reason },
    }))
  })

  it('drops auth codes, provider values and personal data from details', async () => {
    const insert = setupInsert()
    const secretCode = 'epp-secret-value'
    const providerValue = 'private-provider-response'
    const email = 'person@example.net'

    await recordDomainAuditEvent({
      userId: 'user-id',
      customDomainId: 'domain-id',
      domain: 'example.com',
      eventType: 'transfer_code_viewed',
      details: {
        outcome: 'failed',
        reason: 'start_date_missing',
        authCode: secretCode,
        providerResponse: providerValue,
        email,
      } as unknown as DomainAuditDetails,
    })

    const row = insert.mock.calls[0]?.[0] as { details: Record<string, unknown> }
    expect(row.details).toEqual({ outcome: 'failed', reason: 'start_date_missing' })
    expect(JSON.stringify(row.details)).not.toContain(secretCode)
    expect(JSON.stringify(row.details)).not.toContain(providerValue)
    expect(JSON.stringify(row.details)).not.toContain(email)
  })

  it('stores validated failure stage, provider code and masked date shape', async () => {
    const insert = setupInsert()

    await recordDomainAuditEvent({
      userId: 'user-id',
      customDomainId: 'domain-id',
      domain: 'example.com',
      eventType: 'transfer_lock_changed',
      details: {
        outcome: 'unconfirmed',
        stage: 'unlock_readback',
        providerCode: 'domainnameapi:LOCK_NOT_CONFIRMED',
        startDateShape: '99.99.9999 99:99:99',
      },
    })

    const row = insert.mock.calls[0]?.[0] as { details: Record<string, unknown> }
    expect(row.details).toEqual({
      outcome: 'unconfirmed',
      stage: 'unlock_readback',
      providerCode: 'domainnameapi:LOCK_NOT_CONFIRMED',
      startDateShape: '99.99.9999 99:99:99',
    })
  })

  it('rejects unsafe stage, provider code and raw date values', async () => {
    const insert = setupInsert()

    await recordDomainAuditEvent({
      userId: 'user-id',
      customDomainId: 'domain-id',
      domain: 'example.com',
      eventType: 'transfer_lock_changed',
      details: {
        outcome: 'failed',
        stage: 'unexpected-stage',
        providerCode: 'domainnameapi:private value',
        startDateShape: '2026-01-01T10:00:00',
      } as unknown as DomainAuditDetails,
    })

    const row = insert.mock.calls[0]?.[0] as { details: Record<string, unknown> }
    expect(row.details).toEqual({ outcome: 'failed' })
    expect(JSON.stringify(row.details)).not.toContain('2026-01-01T10:00:00')
  })
})
