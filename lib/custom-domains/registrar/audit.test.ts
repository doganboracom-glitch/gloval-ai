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
})
