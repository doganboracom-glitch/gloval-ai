import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AdsRpcClient } from '@/lib/ads/credits'
import { resolvePolicyBlockGlobalDailyCap } from '@/lib/ads/env'
import {
  adsPolicyBlockSubjects,
  policyAttemptReservationId,
  releasePolicyBlockAttempt,
  reservePolicyBlockAttempt,
} from '@/lib/ads/policy-attempts'
import { ADS_POLICY_BLOCK_GLOBAL_SUBJECT } from '@/lib/ads/policy-constants'

const SECRET = 's'.repeat(40)
const ENV = { ADS_ANON_HASH_SECRET: SECRET, ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP: '72' }
const USER = { kind: 'user' as const, userId: 'user-123', ip: '203.0.113.5' }
const ANON = { kind: 'anon' as const, anonId: 'cookie-raw-value', ip: '203.0.113.5' }

function fakeClient(data: unknown = { allowed: true, blocked_subject: null, already_reserved: false }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args })
      return { maybeSingle: async () => ({ data, error: null }) }
    },
  } as unknown as AdsRpcClient
  return { client, calls }
}

describe('Ads policy-block abuse counters', () => {
  it('defaults the global ceiling to 60 and accepts a bounded positive override', () => {
    expect(resolvePolicyBlockGlobalDailyCap({})).toBe(60)
    expect(resolvePolicyBlockGlobalDailyCap({ ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP: '120' })).toBe(120)
    expect(resolvePolicyBlockGlobalDailyCap({ ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP: '0' })).toBe(60)
    expect(resolvePolicyBlockGlobalDailyCap({ ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP: '1e4' })).toBe(60)
  })

  it('uses separate HMAC identity subjects with a shared IP backstop and adjustable global cap', () => {
    const userSubjects = adsPolicyBlockSubjects(USER, ENV)
    const anonSubjects = adsPolicyBlockSubjects(ANON, ENV)

    expect(userSubjects?.subjects).toHaveLength(3)
    expect(userSubjects?.subjects[0]).toMatch(/^ads:policy:user:/)
    expect(userSubjects?.subjects[1]).toMatch(/^ads:policy:ip:/)
    expect(userSubjects?.subjects[2]).toBe(ADS_POLICY_BLOCK_GLOBAL_SUBJECT)
    expect(userSubjects?.subjects).not.toContain(USER.userId)
    expect(userSubjects?.subjects).not.toContain(USER.ip)
    expect(userSubjects?.limits).toEqual([3, 10, 72])

    expect(anonSubjects?.subjects[0]).toMatch(/^ads:policy:cookie:/)
    expect(anonSubjects?.subjects[1]).toBe(userSubjects?.subjects[1])
    expect(anonSubjects?.subjects).not.toContain(ANON.anonId)
    expect(anonSubjects?.limits).toEqual([3, 10, 72])
  })

  it('keeps the identity limit when an authenticated request has no usable IP', () => {
    const subjects = adsPolicyBlockSubjects({ kind: 'user', userId: 'user-123' }, ENV)
    expect(subjects?.subjects).toHaveLength(2)
    expect(subjects?.limits).toEqual([3, 72])
  })

  it('derives a stable, separate reservation id from the scan request id', () => {
    const first = policyAttemptReservationId('req_12345678')
    expect(first).toBe(policyAttemptReservationId('req_12345678'))
    expect(first).not.toBe(policyAttemptReservationId('req_12345679'))
    expect(first).toMatch(/^policy_[A-Fa-f0-9]{40}$/)
  })

  it('reserves through the existing all-or-nothing quota RPC with the policy namespace', async () => {
    const { client, calls } = fakeClient()
    const subjects = adsPolicyBlockSubjects(USER, ENV)!

    await expect(reservePolicyBlockAttempt('req_12345678', USER, ENV, client)).resolves.toEqual({
      allowed: true,
      alreadyReserved: false,
    })
    expect(calls).toEqual([
      {
        fn: 'reserve_ads_free_actions',
        args: {
          p_request_id: policyAttemptReservationId('req_12345678'),
          p_subjects: subjects.subjects,
          p_limits: subjects.limits,
        },
      },
    ])
  })

  it('releases the matching policy-only reservation idempotently', async () => {
    const { client, calls } = fakeClient(true)
    await expect(releasePolicyBlockAttempt('req_12345678', client)).resolves.toBe(true)
    expect(calls).toEqual([
      {
        fn: 'release_ads_free_actions',
        args: { p_request_id: policyAttemptReservationId('req_12345678') },
      },
    ])
  })

  it('fails closed without reserving when the HMAC secret is unavailable', async () => {
    const { client, calls } = fakeClient()
    await expect(
      reservePolicyBlockAttempt('req_12345678', USER, { ADS_POLICY_BLOCK_GLOBAL_DAILY_CAP: '72' }, client),
    ).resolves.toEqual({ allowed: false, reason: 'quota_unavailable', blockedSubject: null })
    expect(calls).toHaveLength(0)
  })
})
