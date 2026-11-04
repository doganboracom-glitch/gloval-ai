import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  adminError: null as Error | null,
  adminCalls: 0,
  rpcData: null as unknown,
  rpcError: null as { message?: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  events: [] as Array<Record<string, unknown>>,
  eventError: null as { message?: string } | null,
  clientCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({
  requireAdmin: vi.fn(async () => {
    state.adminCalls += 1
    if (state.adminError) throw state.adminError
    return { userId: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test' }
  }),
}))
vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: vi.fn(async () => ({ kind: 'authenticated', user: { id: 'admin-user-id' } })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    state.clientCalls += 1
    return {
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args })
        return { data: state.rpcData, error: state.rpcError }
      },
      from: () => {
        const query: any = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: async () => ({ data: state.events, error: state.eventError }),
        }
        return query
      },
    }
  }),
}))

import {
  getReferralPartnerHistory,
  searchReferralPartners,
  updateReferralPartnerStatus,
} from '@/lib/referrals/admin-actions'

const partnerId = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.stubEnv('REFERRAL_ENABLED', '1')
  state.adminError = null
  state.adminCalls = 0
  state.rpcData = { ok: true }
  state.rpcError = null
  state.rpcCalls = []
  state.events = []
  state.eventError = null
  state.clientCalls = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('referral admin actions', () => {
  it('requires an admin before transitioning status and records the actor in the RPC call', async () => {
    await expect(updateReferralPartnerStatus(partnerId, 'suspend')).resolves.toEqual({ ok: true })

    expect(state.adminCalls).toBe(1)
    expect(state.rpcCalls).toEqual([{
      name: 'transition_referral_partner_status',
      args: {
        p_partner_id: partnerId,
        p_actor_user_id: '11111111-1111-4111-8111-111111111111',
        p_action: 'suspend',
      },
    }])
  })

  it('does not query partner data when admin authorization fails', async () => {
    state.adminError = new Error('not_admin')

    await expect(updateReferralPartnerStatus(partnerId, 'close')).rejects.toThrow('not_admin')
    expect(state.clientCalls).toBe(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('maps stale status conflicts to a safe action error', async () => {
    state.rpcData = { ok: false, error: 'invalid_transition' }

    await expect(updateReferralPartnerStatus(partnerId, 'suspend')).resolves.toEqual({
      ok: false,
      error: 'transition_conflict',
    })
  })

  it('searches by email server-side and returns only the masked email', async () => {
    state.rpcData = [{
      partnerId,
      referralCode: 'PARTNER1234',
      status: 'active',
      activatedAt: '2026-11-04T12:00:00.000Z',
      lastStatusChangedAt: '2026-11-04T12:00:00.000Z',
      email: 'member@example.test',
      clicks: 4,
      signups: 1,
      verifiedSignups: 1,
      paidCustomers: 0,
    }]

    const results = await searchReferralPartners('member@example.test')

    expect(state.adminCalls).toBe(1)
    expect(state.rpcCalls).toEqual([{
      name: 'referral_partner_admin_summary',
      args: { p_query: 'member@example.test' },
    }])
    expect(results?.[0].maskedEmail).toBe('m***@example.test')
    expect(JSON.stringify(results)).not.toContain('member@example.test')
  })

  it('returns status history only after admin authorization', async () => {
    state.events = [{
      id: '33333333-3333-4333-8333-333333333333',
      actor_user_id: '11111111-1111-4111-8111-111111111111',
      action: 'suspend',
      from_status: 'active',
      to_status: 'suspended',
      created_at: '2026-11-04T12:00:00.000Z',
    }]

    const history = await getReferralPartnerHistory(partnerId)

    expect(state.adminCalls).toBe(1)
    expect(history).toMatchObject([{
      actorUserId: '11111111-1111-4111-8111-111111111111',
      action: 'suspend',
      fromStatus: 'active',
      toStatus: 'suspended',
    }])
  })
})
