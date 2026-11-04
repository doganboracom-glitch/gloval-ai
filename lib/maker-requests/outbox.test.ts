import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  after: vi.fn(),
  sendTransactionalEmailDetailed: vi.fn(),
  insertedRows: [] as Array<Record<string, unknown>>,
  storedJob: null as Record<string, unknown> | null,
  insertError: null as { code: string } | null,
}))

vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/notify', () => ({ sendTransactionalEmailDetailed: mocks.sendTransactionalEmailDetailed }))

import { enqueueReferralPartnerActivationEmail } from './outbox'

describe('referral partner activation outbox', () => {
  beforeEach(() => {
    mocks.insertedRows = []
    mocks.storedJob = null
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

  it('sends the admin notice with an idempotency key and no payout details', async () => {
    vi.stubEnv('ADMIN_NOTIFICATION_EMAIL', 'ops@example.test,backup@example.test')
    mocks.sendTransactionalEmailDetailed.mockResolvedValue({ ok: true })
    mocks.createAdminClient.mockImplementation(() => ({
      from: (table: string) => ({
        insert: async (rows: Array<Record<string, unknown>>) => {
          expect(table).toBe('notification_logs')
          mocks.insertedRows.push(...rows)
          const [row] = rows
          mocks.storedJob = {
            ...row,
            id: 'outbox-id',
            created_at: '2026-11-04T12:30:00.000Z',
          }
          return { error: null }
        },
        select: () => {
          const filters: Record<string, unknown> = {}
          const query: any = {
            eq: (key: string, value: unknown) => {
              filters[key] = value
              return query
            },
            maybeSingle: async () => {
              const job = mocks.storedJob
              const matches = job && Object.entries(filters).every(([key, value]) => job[key] === value)
              return { data: matches ? job : null, error: null }
            },
          }
          return query
        },
        update: (payload: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {}
          const query: any = {
            eq: (key: string, value: unknown) => {
              filters[key] = value
              return query
            },
            neq: (key: string, value: unknown) => {
              filters[`not:${key}`] = value
              return query
            },
            select: () => query,
            maybeSingle: async () => {
              const job = mocks.storedJob
              const matches = job && Object.entries(filters).every(([key, value]) => (
                key.startsWith('not:') ? job[key.slice(4)] !== value : job[key] === value
              ))
              if (!matches || !job) return { data: null, error: null }
              mocks.storedJob = { ...job, ...payload }
              return { data: { id: job.id }, error: null }
            },
          }
          return query
        },
      }),
    }))

    await enqueueReferralPartnerActivationEmail({
      referralCode: 'PARTNER1234',
      activatedAt: '2026-11-04T12:30:00.000Z',
      lang: 'en',
    })
    const deliver = mocks.after.mock.calls[0][0] as () => Promise<void>
    await deliver()

    expect(mocks.sendTransactionalEmailDetailed).toHaveBeenCalledOnce()
    expect(mocks.sendTransactionalEmailDetailed).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ops@example.test',
      idempotencyKey: 'referral-partner-admin:PARTNER1234',
    }))
    const sentEmail = mocks.sendTransactionalEmailDetailed.mock.calls[0][0]
    expect(sentEmail.html).toContain('PARTNER1234')
    expect(sentEmail.html.toLowerCase()).not.toContain('iban')
    expect(sentEmail.html).not.toContain('ops@example.test')
  })
})
