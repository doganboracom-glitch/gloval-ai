import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  authState: { kind: 'authenticated', user: { id: 'partner-user-id' } } as any,
  rpcData: null as unknown,
  rpcError: null as any,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  requireAdminCalls: 0,
  requireAdminError: null as Error | null,
  adminClientCalls: 0,
  userCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: vi.fn(async () => {
    state.userCalls += 1
    return state.authState
  }),
}))
vi.mock('@/lib/mail/admin-guard', () => ({
  requireAdmin: vi.fn(async () => {
    state.requireAdminCalls += 1
    if (state.requireAdminError) throw state.requireAdminError
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    state.adminClientCalls += 1
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args })
        return { data: state.rpcData, error: state.rpcError }
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'referral_partners' ? { id: ownSummary.partnerId } : null,
              error: null,
            }),
          }),
        }),
      }),
    }
  }),
}))

import {
  getReferralAdminSummary,
  getReferralDashboardData,
  mapReferralAdminRpcResult,
  mapReferralDashboardRpcResult,
} from '@/lib/referrals/partner-data'

const privateEmail = 'maria@gmail.com'
const ownSummary = {
  partnerId: '22222222-2222-4222-8222-222222222222',
  referralCode: 'PARTNER1234',
  status: 'active',
  activatedAt: '2026-11-04T12:00:00.000Z',
  lastStatusChangedAt: '2026-11-04T12:00:00.000Z',
  clicks: 100,
  signups: 10,
  verifiedSignups: 8,
  paidCustomers: 2,
  customers: [{ email: privateEmail, status: 'paid', createdAt: '2026-11-03T12:00:00.000Z' }],
}

beforeEach(() => {
  state.authState = { kind: 'authenticated', user: { id: 'partner-user-id' } }
  state.rpcData = [ownSummary]
  state.rpcError = null
  state.rpcCalls = []
  state.requireAdminCalls = 0
  state.requireAdminError = null
  state.adminClientCalls = 0
  state.userCalls = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('referral partner data', () => {
  it('masks customer email server-side and returns no raw email field', () => {
    const mapped = mapReferralDashboardRpcResult([ownSummary])

    expect(mapped?.customers[0].maskedEmail).toBe('m***@gmail.com')
    expect(mapped?.customers[0].status).toBe('paid')
    expect(JSON.stringify(mapped)).not.toContain(privateEmail)
    expect(mapped?.customers[0]).not.toHaveProperty('email')
  })

  it('lazily syncs owned commissions before loading masked dashboard metrics', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')

    const result = await getReferralDashboardData()

    expect(result?.clicks).toBe(100)
    expect(result?.signups).toBe(10)
    expect(result?.verifiedSignups).toBe(8)
    expect(result?.paidCustomers).toBe(2)
    expect(result?.customers[0].maskedEmail).toBe('m***@gmail.com')
    expect(JSON.stringify(result)).not.toContain(privateEmail)
    expect(state.rpcCalls).toEqual([
      { name: 'referral_sync_commissions', args: { p_partner_id: ownSummary.partnerId } },
      {
        name: 'referral_partner_dashboard',
        args: { p_user_id: 'partner-user-id', p_include_customers: true },
      },
    ])
  })

  it('keeps the admin summary read-only and masks partner emails', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    state.rpcData = [{ ...ownSummary, email: privateEmail, customers: [] }]

    const result = await getReferralAdminSummary()

    expect(state.requireAdminCalls).toBe(1)
    expect(state.rpcCalls).toEqual([{ name: 'referral_partner_admin_summary', args: { p_query: null } }])
    expect(result?.[0].maskedEmail).toBe('m***@gmail.com')
    expect(result?.[0].partnerId).toBe(ownSummary.partnerId)
    expect(JSON.stringify(result)).not.toContain(privateEmail)
  })

  it('shows a safe unavailable state when the admin migration has not been applied', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '1')
    state.rpcError = new Error('function not found')

    await expect(getReferralAdminSummary()).resolves.toBeNull()
    expect(state.requireAdminCalls).toBe(1)
    expect(state.rpcCalls).toHaveLength(1)
  })

  it('does not query admin data before requireAdmin succeeds', async () => {
    state.requireAdminError = new Error('not_admin')

    await expect(getReferralAdminSummary()).rejects.toThrow('not_admin')
    expect(state.requireAdminCalls).toBe(1)
    expect(state.adminClientCalls).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('returns no dashboard data and makes no referral query while the flag is off', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '0')

    await expect(getReferralDashboardData()).resolves.toBeNull()
    expect(state.userCalls).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('maps incomplete admin rows without exposing invalid or unmasked values', () => {
    const rows = mapReferralAdminRpcResult([
      { ...ownSummary, email: null },
      { ...ownSummary, referralCode: 'bad code' },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].maskedEmail).toBe('***')
    expect(JSON.stringify(rows)).not.toContain(privateEmail)
  })
})
