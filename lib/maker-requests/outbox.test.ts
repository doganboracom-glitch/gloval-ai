import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  after: vi.fn(),
  sendTransactionalEmailDetailed: vi.fn(),
  insertedRows: [] as Array<Record<string, unknown>>,
  insertError: null as { code: string } | null,
}))

vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/notify', () => ({ sendTransactionalEmailDetailed: mocks.sendTransactionalEmailDetailed }))

import { enqueueReferralPartnerActivationEmail } from './outbox'

describe('referral partner activation outbox', () => {
  beforeEach(() => {
    mocks.insertedRows = []
    mocks.insertError = null
    mocks.after.mockReset()
    mocks.sendTransactionalEmailDetailed.mockReset()
    mocks.createAdminClient.mockReset().mockImplementation(() => ({
      from: (table: string) => ({
        insert: async (rows: Array<Record<string, unknown>>) => {
          expect(table).toBe('notification_logs')
          mocks.insertedRows.push(...rows)
          return { error: mocks.insertError }
        },
      }),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('queues an idempotent admin notice with only referral code and activation date', async () => {
    const activatedAt = '2026-11-04T12:30:00.000Z'

    await enqueueReferralPartnerActivationEmail({
      referralCode: 'partner1234',
      activatedAt,
      lang: 'en',
    })

    expect(mocks.insertedRows).toHaveLength(1)
    const [row] = mocks.insertedRows
    expect(row).toMatchObject({
      channel: 'email',
      type: 'referral_partner_admin',
      subject: 'New referral partner activated',
      dedupe_key: 'referral_partner_admin:PARTNER1234',
      status: 'queued',
      user_id: null,
    })
    const body = JSON.parse(String(row.body)) as Record<string, unknown>
    expect(body).toEqual({
      lang: 'en',
      attempts: 0,
      referralCode: 'PARTNER1234',
      activatedAt,
    })
    expect(body).not.toHaveProperty('iban')
    expect(body).not.toHaveProperty('email')
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('does not throw or block activation when the outbox insert fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.insertError = { code: 'OUTBOX_UNAVAILABLE' }

    await expect(enqueueReferralPartnerActivationEmail({
      referralCode: 'PARTNER1234',
      activatedAt: '2026-11-04T12:30:00.000Z',
      lang: 'tr',
    })).resolves.toBeUndefined()

    expect(mocks.after).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('ignores duplicate activation events by the dedupe key', async () => {
    mocks.insertError = { code: '23505' }

    await expect(enqueueReferralPartnerActivationEmail({
      referralCode: 'PARTNER1234',
      activatedAt: '2026-11-04T12:30:00.000Z',
      lang: 'tr',
    })).resolves.toBeUndefined()

    expect(mocks.after).not.toHaveBeenCalled()
  })
})
