// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  processAddOnExpiryReminders: vi.fn(),
  processDueEmailEvents: vi.fn(),
  processContactAcks: vi.fn(),
  processMakerRequestEmails: vi.fn(),
  processReferralEmails: vi.fn(),
  syncReferralCommissions: vi.fn(),
}))

vi.mock('@/lib/addon-expiry-reminders', () => ({
  processAddOnExpiryReminders: mocks.processAddOnExpiryReminders,
}))
vi.mock('@/lib/email-outbox', () => ({ processDueEmailEvents: mocks.processDueEmailEvents }))
vi.mock('@/lib/support/contact-ack', () => ({ processContactAcks: mocks.processContactAcks }))
vi.mock('@/lib/maker-requests/outbox', () => ({ processMakerRequestEmails: mocks.processMakerRequestEmails }))
vi.mock('@/lib/referrals/email-outbox', () => ({ processReferralEmails: mocks.processReferralEmails }))
vi.mock('@/lib/referrals/commission-sync', () => ({ syncReferralCommissions: mocks.syncReferralCommissions }))

import { GET } from './route'

const request = () =>
  new Request('https://gloval.ai/api/cron/email-outbox', {
    headers: { authorization: 'Bearer cron-secret' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  mocks.syncReferralCommissions.mockResolvedValue({ ok: true, created: 1, reversed: 2, matured: 3 })
  mocks.processDueEmailEvents.mockResolvedValue({ sent: 4, retry: 5, failed: 6, deferred: 7 })
  mocks.processContactAcks.mockResolvedValue({ sent: 8, retry: 9, gaveUp: 10, skipped: 11 })
  mocks.processMakerRequestEmails.mockResolvedValue({ sent: 12, retry: 13, gaveUp: 14, skipped: 15 })
  mocks.processReferralEmails.mockResolvedValue({ sent: 16, retry: 17, deferred: 18, gaveUp: 19 })
  mocks.processAddOnExpiryReminders.mockResolvedValue({ scanned: 20, sent: 21, skipped: 22, failed: 23 })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/cron/email-outbox', () => {
  it('keeps the outbox successful and preserves other sweep results when add-on reminders throw', async () => {
    const safeError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.processAddOnExpiryReminders.mockRejectedValueOnce(new Error('customer@example.com'))

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      sent: 4,
      retry: 5,
      failed: 6,
      deferred: 7,
      contactAcks: { sent: 8, retry: 9, gaveUp: 10, skipped: 11 },
      makerRequests: { sent: 12, retry: 13, gaveUp: 14, skipped: 15 },
      referralEmails: { sent: 16, retry: 17, deferred: 18, gaveUp: 19 },
      addOnReminders: { ok: false, error: 'sweep_failed' },
      commissionSync: { ok: true, created: 1, reversed: 2, matured: 3 },
    })
    expect(mocks.processDueEmailEvents).toHaveBeenCalledOnce()
    expect(mocks.processContactAcks).toHaveBeenCalledOnce()
    expect(mocks.processMakerRequestEmails).toHaveBeenCalledOnce()
    expect(mocks.processReferralEmails).toHaveBeenCalledOnce()
    expect(safeError).toHaveBeenCalledWith('[email-outbox] add-on reminder sweep failed; details omitted')
    expect(JSON.stringify(safeError.mock.calls)).not.toContain('customer@example.com')
  })
})
