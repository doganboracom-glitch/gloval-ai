import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import {
  ADS_CREDIT_ACTIONS,
  ADS_CREDIT_COSTS,
  adsChargeReason,
  adsRefundReason,
  isAdsLedgerReason,
} from '@/lib/ads/credit-costs'
import { chargeAdsCredits, refundAdsCredits, type AdsRpcClient } from '@/lib/ads/credits'
import {
  anonymousSubjects,
  releaseAdsFreeActions,
  reserveAdsFreeActions,
  signedInSubjects,
} from '@/lib/ads/free-quota'

type Call = { fn: string; args: Record<string, unknown> }

function fakeClient(result: { data: unknown; error: { message: string } | null }): {
  client: AdsRpcClient
  calls: Call[]
} {
  const calls: Call[] = []
  const client: AdsRpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args })
      return { maybeSingle: async () => result }
    },
  }
  return { client, calls }
}

const REQ = 'req-abcdef12'
const SERVER_RPC_REASON = /^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$/

describe('ads ledger reasons', () => {
  it('every action produces a reason accepted by the RPC regex, with a distinct refund reason', () => {
    for (const action of ADS_CREDIT_ACTIONS) {
      const reason = adsChargeReason(action, REQ)
      expect(reason).toMatch(SERVER_RPC_REASON)
      expect(adsRefundReason(action, REQ)).toBe(`ads_refund:${reason.slice(4)}`)
      expect(ADS_CREDIT_COSTS[action]).toBeGreaterThan(0)
    }
    expect(adsChargeReason('weeklyOptimization', REQ)).toBe('ads:weekly_optimization:req-abcdef12')
  })

  it('rejects request ids the RPC would reject', () => {
    for (const bad of ['short', 'has space 123', 'semi;colon1234', 'x'.repeat(129), '']) {
      expect(() => adsChargeReason('image', bad)).toThrow()
    }
  })

  it('recognises the ads namespace', () => {
    expect(isAdsLedgerReason('ads:image:req-abcdef12')).toBe(true)
    expect(isAdsLedgerReason('ads_refund:image:req-abcdef12')).toBe(true)
    expect(isAdsLedgerReason('image_generation')).toBe(false)
    expect(isAdsLedgerReason(null)).toBe(false)
    expect(isAdsLedgerReason(undefined)).toBe(false)
  })
})

describe('chargeAdsCredits / refundAdsCredits', () => {
  it('calls only ads_charge_credits with the configured price and reason', async () => {
    const { client, calls } = fakeClient({
      data: { ok: true, balance: 7, already_charged: false, charged_amount: 3 },
      error: null,
    })
    const result = await chargeAdsCredits('user-1', 'image', REQ, client)
    expect(result).toEqual({
      ok: true,
      balance: 7,
      alreadyCharged: false,
      chargedAmount: 3,
      reason: 'ads:image:req-abcdef12',
    })
    expect(calls).toEqual([
      { fn: 'ads_charge_credits', args: { p_user_id: 'user-1', p_amount: 3, p_reason: 'ads:image:req-abcdef12' } },
    ])
  })

  it('reports insufficient credits and fails closed on RPC errors', async () => {
    const low = fakeClient({ data: { ok: false, balance: 1, already_charged: false, charged_amount: 0 }, error: null })
    expect(await chargeAdsCredits('u', 'publish', REQ, low.client)).toEqual({
      ok: false,
      reason: 'insufficient_credits',
      balance: 1,
    })

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = fakeClient({ data: null, error: { message: 'db down' } })
    expect(await chargeAdsCredits('u', 'publish', REQ, broken.client)).toEqual({
      ok: false,
      reason: 'charge_failed',
      balance: 0,
    })
    spy.mockRestore()
  })

  it('refunds through ads_refund_credits with the matching charge reason', async () => {
    const { client, calls } = fakeClient({ data: { refunded: true, balance: 10, refunded_amount: 3 }, error: null })
    expect(await refundAdsCredits('user-1', 'image', REQ, client)).toEqual({
      refunded: true,
      balance: 10,
      refundedAmount: 3,
    })
    expect(calls).toEqual([
      { fn: 'ads_refund_credits', args: { p_user_id: 'user-1', p_charge_reason: 'ads:image:req-abcdef12' } },
    ])
  })

  it('reports no refund when the RPC errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ data: null, error: { message: 'nope' } })
    expect(await refundAdsCredits('u', 'image', REQ, client)).toEqual({
      refunded: false,
      balance: 0,
      refundedAmount: 0,
    })
    spy.mockRestore()
  })
})

describe('free quota subjects', () => {
  const SECRET = 'x'.repeat(40)

  it('signed-in users get one per-user counter', () => {
    expect(signedInSubjects('user-1')).toEqual({
      subjects: ['ads:user:user-1'],
      limits: [3],
      anonSubjectHash: null,
    })
  })

  it('anonymous visitors get hashed cookie, ip and global counters and never leak raw values', () => {
    const subjects = anonymousSubjects(
      { anonId: 'cookie-123', ip: '203.0.113.9' },
      { ADS_ANON_HASH_SECRET: SECRET, ADS_ANON_DAILY_CAP: '50' },
    )
    expect(subjects).not.toBeNull()
    const joined = subjects!.subjects.join('|')
    expect(joined).not.toContain('cookie-123')
    expect(joined).not.toContain('203.0.113.9')
    expect(subjects!.subjects[2]).toBe('ads:global:anon')
    expect(subjects!.limits).toEqual([2, 15, 50])
    expect(subjects!.anonSubjectHash).toBe(subjects!.subjects[0].replace('ads:anon:', ''))
  })

  it('is deterministic per secret and differs across secrets', () => {
    const input = { anonId: 'cookie-123', ip: '203.0.113.9' }
    const a = anonymousSubjects(input, { ADS_ANON_HASH_SECRET: SECRET })
    const b = anonymousSubjects(input, { ADS_ANON_HASH_SECRET: SECRET })
    const c = anonymousSubjects(input, { ADS_ANON_HASH_SECRET: 'y'.repeat(40) })
    expect(a).toEqual(b)
    expect(a!.subjects[0]).not.toBe(c!.subjects[0])
  })

  it('refuses anonymous access without a long enough secret and falls back on a bad cap', () => {
    expect(anonymousSubjects({ anonId: 'a', ip: 'b' }, {})).toBeNull()
    expect(anonymousSubjects({ anonId: 'a', ip: 'b' }, { ADS_ANON_HASH_SECRET: 'short' })).toBeNull()
    const s = anonymousSubjects({ anonId: 'a', ip: 'b' }, { ADS_ANON_HASH_SECRET: SECRET, ADS_ANON_DAILY_CAP: 'abc' })
    expect(s!.limits[2]).toBe(100)
  })
})

describe('reserve / release', () => {
  const subjects = signedInSubjects('user-1')

  it('maps the RPC row to a reservation', async () => {
    const ok = fakeClient({ data: { allowed: true, blocked_subject: null, already_reserved: false }, error: null })
    expect(await reserveAdsFreeActions(REQ, subjects, ok.client)).toEqual({ allowed: true, alreadyReserved: false })
    expect(ok.calls[0]).toEqual({
      fn: 'reserve_ads_free_actions',
      args: { p_request_id: REQ, p_subjects: ['ads:user:user-1'], p_limits: [3] },
    })

    const blocked = fakeClient({
      data: { allowed: false, blocked_subject: 'ads:user:user-1', already_reserved: false },
      error: null,
    })
    expect(await reserveAdsFreeActions(REQ, subjects, blocked.client)).toEqual({
      allowed: false,
      reason: 'limit_reached',
      blockedSubject: 'ads:user:user-1',
    })
  })

  it('fails closed when the counter is unreachable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ data: null, error: { message: 'timeout' } })
    expect(await reserveAdsFreeActions(REQ, subjects, client)).toEqual({
      allowed: false,
      reason: 'quota_unavailable',
      blockedSubject: null,
    })
    spy.mockRestore()
  })

  it('release reports whether anything was given back and validates the request id', async () => {
    const yes = fakeClient({ data: true, error: null })
    expect(await releaseAdsFreeActions(REQ, yes.client)).toBe(true)
    const no = fakeClient({ data: false, error: null })
    expect(await releaseAdsFreeActions(REQ, no.client)).toBe(false)
    await expect(releaseAdsFreeActions('bad id', yes.client)).rejects.toThrow()
    await expect(reserveAdsFreeActions('bad id', subjects, yes.client)).rejects.toThrow()
  })
})
