import { describe, expect, it } from 'vitest'
import { ADS_POLICY_BLOCK_GLOBAL_SUBJECT } from '@/lib/ads/policy-constants'
import { runScan, type ScanDeps } from '@/lib/ads/scan-orchestrator'
import {
  ANON_ACTOR,
  COPY_OUTPUT,
  PLANNER_OUTPUT,
  SNAPSHOT,
  USER_ACTOR,
  makeDeps,
} from '@/lib/ads/testing/scan-fixtures'

const REQUEST = { address: 'ornekmutfak.com', requestId: 'req_12345678' }

function plannerThen(copy: unknown, planner: unknown = PLANNER_OUTPUT): ScanDeps['generate'] {
  let n = 0
  return (async () => {
    n++
    return { object: n === 1 ? planner : copy, usage: { inputTokens: 100, outputTokens: 50 } }
  }) as unknown as ScanDeps['generate']
}

describe('runScan: success', () => {
  it('returns a validated result and keeps the free action', async () => {
    const { deps, calls } = makeDeps()
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.mode).toBe('free')
    expect(outcome.result.budget.daily).toBe(300)
    expect(outcome.result.plan.cities).toEqual(['Ankara'])
    expect(outcome.result.ad.headlines.length).toBeGreaterThanOrEqual(3)
    expect(calls.release).toBe(0)
    expect(calls.releasePolicy).toBe(1)
    expect(calls.charge).toBe(0)
    const scan = calls.usage.find((row) => row.flow === 'scan')
    expect(scan).toMatchObject({ outcome: 'ok', free_quota_used: true, credits_charged: 0, anon_subject_hash: 'hash' })
    expect(calls.usage.map((row) => row.flow).sort()).toEqual(['plan', 'preview', 'scan'])
  })

  it('charges credits when the free allowance is used up for a signed-in user', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:user:x' }),
    })
    const outcome = await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)
    expect(outcome.ok && outcome.result.mode).toBe('paid')
    expect(calls.charge).toBe(1)
    expect(calls.refund).toBe(0)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({ credits_charged: 2, free_quota_used: false, user_id: 'user-1' })
  })
})

describe('runScan: quota and rate limits', () => {
  it('rejects a bad address and request id without touching quota', async () => {
    const { deps, calls } = makeDeps()
    expect(await runScan({ address: 'http://127.0.0.1', requestId: 'req_12345678', actor: USER_ACTOR }, deps)).toEqual({
      ok: false,
      error: { code: 'invalid_request' },
    })
    expect(await runScan({ address: 'a.com', requestId: 'x', actor: USER_ACTOR }, deps)).toEqual({
      ok: false,
      error: { code: 'invalid_request' },
    })
    expect(calls.reserve).toBe(0)
  })

  it('returns rate_limited with a retry hint', async () => {
    const { deps, calls } = makeDeps({ rateLimit: () => ({ allowed: false, retryAfterMs: 12_300 }) })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'rate_limited', retryAfterSeconds: 13 } })
    expect(calls.reserve).toBe(0)
  })

  it('asks an exhausted visitor to sign in', async () => {
    const { deps } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:anon:h' }),
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'login_required' } })
  })

  it('reports anon_capacity and alerts when the global ceiling blocks', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:global:anon' }),
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'anon_capacity' } })
    expect(calls.alerts).toEqual(['full'])
  })

  it('fails closed when the quota counter is unavailable', async () => {
    const { deps } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'quota_unavailable', blockedSubject: null }),
    })
    expect(await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'service_unavailable' } })
  })

  it('fails closed when the anonymous secret is missing', async () => {
    const { deps, calls } = makeDeps({ subjectsFor: () => null })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'service_unavailable' } })
    expect(calls.reserve).toBe(0)
  })

  it('treats a repeated reservation as a duplicate and releases nothing', async () => {
    const { deps, calls } = makeDeps({ reserveFree: async () => ({ allowed: true, alreadyReserved: true }) })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'duplicate' } })
    expect(calls.release).toBe(0)
    expect(calls.usage).toHaveLength(0)
  })

  it('never runs the model for an already-charged request id', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:user:x' }),
      charge: async () => ({ ok: true, balance: 5, alreadyCharged: true, chargedAmount: 0, reason: 'dup' }),
    })
    expect(await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'duplicate' } })
    expect(calls.generate).toHaveLength(0)
    expect(calls.refund).toBe(0)
  })

  it('reports credits_required with the balance and does not call the model', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:user:x' }),
      charge: async () => ({ ok: false, reason: 'insufficient_credits', balance: 1 }),
    })
    expect(await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)).toEqual({
      ok: false,
      error: { code: 'credits_required', balance: 1 },
    })
    expect(calls.generate).toHaveLength(0)
  })
})

describe('runScan: admin alerts', () => {
  it('warns once at 50 percent and at 100 percent of the ceiling', async () => {
    const half = makeDeps({ readGlobalAnonUsed: async () => 50 })
    await runScan({ ...REQUEST, actor: ANON_ACTOR }, half.deps)
    expect(half.calls.alerts).toEqual(['half'])

    const full = makeDeps({ readGlobalAnonUsed: async () => 100 })
    await runScan({ ...REQUEST, actor: ANON_ACTOR }, full.deps)
    expect(full.calls.alerts).toEqual(['full'])

    const quiet = makeDeps({ readGlobalAnonUsed: async () => 49 })
    await runScan({ ...REQUEST, actor: ANON_ACTOR }, quiet.deps)
    expect(quiet.calls.alerts).toEqual([])
  })

  it('does not alert for signed-in users', async () => {
    const { deps, calls } = makeDeps({ readGlobalAnonUsed: async () => 100 })
    await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)
    expect(calls.alerts).toEqual([])
  })
})

describe('runScan: refunds on failure', () => {
  it('releases the free action when the site is unreachable', async () => {
    const { deps, calls } = makeDeps({
      scanSite: async () => ({ ok: false, code: 'unreachable', detail: 'robots_disallowed' as never }),
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'unreachable' } })
    expect(calls.release).toBe(1)
    expect(calls.generate).toHaveLength(0)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({ outcome: 'error', error_code: 'unreachable', free_quota_used: false })
  })

  it('maps thin pages to insufficient_content and refunds a paid scan', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'x' }),
      scanSite: async () => ({ ok: false, code: 'insufficient_content', detail: 'insufficient_content' }),
    })
    const outcome = await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'insufficient_content' } })
    expect(calls.charge).toBe(0)
  })

  it('blocks a prohibited site before any model call and gives the action back', async () => {
    const { deps, calls } = makeDeps({
      scanSite: async () => ({ ok: true, snapshot: { ...SNAPSHOT, host: 'bahis-sitesi.com', finalHost: 'bahis-sitesi.com', title: 'Casino ve canlı bahis' } }),
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'policy_blocked', consumed: false } })
    expect(calls.generate).toHaveLength(0)
    expect(calls.reservePolicy).toBe(0)
    expect(calls.charge).toBe(0)
    expect(calls.release).toBe(1)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({
      free_quota_used: false,
      error_code: 'policy_blocked:gambling',
    })
  })

  it('ignores a standalone sex-shop SEO label without explicit adult content', async () => {
    const snapshot = {
      ...SNAPSHOT,
      host: 'lilashop.com.tr',
      finalHost: 'www.lilashop.com.tr',
      title: 'Lila Shop - Seks Shop',
      description: 'Seks Shop and lingerie collection',
      navLabels: ['İç giyim', 'Mayo', 'Bikini'],
    }
    const { deps, calls } = makeDeps({ scanSite: async () => ({ ok: true, snapshot }) })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)

    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.result.restricted).toEqual([])
    expect(calls.generate).toHaveLength(2)
    expect(calls.reservePolicy).toBe(1)
    expect(calls.charge).toBe(0)
    expect(calls.release).toBe(0)
  })

  it('keeps only the policy-abuse slot for a verified hard block', async () => {
    const snapshot = { ...SNAPSHOT, text: 'We publish adult entertainment.' }
    const { deps, calls } = makeDeps({
      scanSite: async () => ({ ok: true, snapshot }),
      generate: plannerThen(COPY_OUTPUT, {
        ...PLANNER_OUTPUT,
        policyCategory: 'adult',
        policyEvidence: 'explicit',
        policyEvidenceQuote: 'adult entertainment',
      }),
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome).toEqual({
      ok: false,
      error: {
        code: 'policy_blocked',
        consumed: false,
        messageKey: 'errPolicyBlockedAdultConsumed',
      },
    })
    expect(outcome.ok ? null : outcome.error).not.toHaveProperty('blockedCategories')
    expect(outcome.ok ? null : outcome.error).not.toHaveProperty('policyEvidenceQuote')
    expect(calls.release).toBe(1)
    expect(calls.releasePolicy).toBe(0)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({
      outcome: 'error',
      free_quota_used: false,
      credits_charged: 0,
      error_code: 'policy_blocked:adult',
    })
  })

  it('rejects policy attempts at the global limit before charging or invoking AI', async () => {
    const { deps, calls } = makeDeps({
      reservePolicyAttempt: async () => ({
        allowed: false,
        reason: 'limit_reached',
        blockedSubject: ADS_POLICY_BLOCK_GLOBAL_SUBJECT,
      }),
      readGlobalPolicyBlockUsed: async () => 60,
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'policy_attempt_limit' } })
    expect(calls.generate).toHaveLength(0)
    expect(calls.charge).toBe(0)
    expect(calls.release).toBe(1)
    expect(calls.policyAlerts).toEqual([{ cap: 60, used: 60 }])
  })

  it('refunds paid credits for a hard block and retains only the policy-abuse slot', async () => {
    const snapshot = { ...SNAPSHOT, text: 'We publish adult entertainment.' }
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:user:user-1' }),
      scanSite: async () => ({ ok: true, snapshot }),
      generate: plannerThen(COPY_OUTPUT, {
        ...PLANNER_OUTPUT,
        policyCategory: 'adult',
        policyEvidence: 'explicit',
        policyEvidenceQuote: 'adult entertainment',
      }),
    })
    const outcome = await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)
    expect(outcome).toEqual({
      ok: false,
      error: {
        code: 'policy_blocked',
        consumed: false,
        messageKey: 'errPolicyBlockedAdultConsumed',
      },
    })
    expect(calls.charge).toBe(1)
    expect(calls.refund).toBe(1)
    expect(calls.release).toBe(0)
    expect(calls.releasePolicy).toBe(0)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({
      outcome: 'refunded',
      free_quota_used: false,
      credits_charged: 0,
      error_code: 'policy_blocked:adult',
    })
  })

  it('does not warn on directory vocabulary or an ambiguous model-only category', async () => {
    const snapshot = {
      ...SNAPSHOT,
      host: '444rehber.com',
      finalHost: '444rehber.com',
      title: '444 Rehber',
      description: 'Firma rehberi, işletme ilanları ve ödeme seçenekleri',
      siteName: '444 Rehber',
      headings: ['İşletme rehberi', 'İlan ver'],
      navLabels: ['Firmalar', 'Rehber', 'Ödeme', 'SEO'],
      text: 'Kredi bakiyesi, kredi kullanımı, sağlık ve firma rehberi.',
    }
    const { deps, calls } = makeDeps({
      scanSite: async () => ({ ok: true, snapshot }),
      generate: plannerThen(COPY_OUTPUT, {
        ...PLANNER_OUTPUT,
        policyCategory: 'adult',
        policyEvidence: 'ambiguous',
        policyEvidenceQuote: '',
      }),
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome.ok && outcome.result.restricted).toEqual([])
    expect(calls.release).toBe(0)
    expect(calls.releasePolicy).toBe(1)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({
      outcome: 'ok',
      free_quota_used: true,
      error_code: null,
    })
  })

  it('retains a restricted category when its explicit signal is present', async () => {
    const snapshot = { ...SNAPSHOT, title: 'Butik şarap' }
    const { deps } = makeDeps({
      scanSite: async () => ({ ok: true, snapshot }),
      generate: plannerThen(COPY_OUTPUT, {
        ...PLANNER_OUTPUT,
        policyCategory: 'alcohol',
        policyEvidence: 'explicit',
        policyEvidenceQuote: 'Butik şarap',
      }),
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome.ok && outcome.result.restricted).toEqual(['alcohol'])
  })

  it('refunds credits and writes a refunded row when the plan is unusable', async () => {
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'x' }),
      generate: plannerThen(COPY_OUTPUT, { ...PLANNER_OUTPUT, keywords: ['a b'] }),
    })
    const outcome = await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'generation_failed' } })
    expect(calls.charge).toBe(1)
    expect(calls.refund).toBe(1)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({ outcome: 'refunded', credits_charged: 0 })
  })

  it('retries a transient idempotent credit refund before writing the failed outcome', async () => {
    let refundCalls = 0
    const { deps, calls } = makeDeps({
      reserveFree: async () => ({ allowed: false, reason: 'limit_reached', blockedSubject: 'ads:user:x' }),
      generate: plannerThen(COPY_OUTPUT, { ...PLANNER_OUTPUT, keywords: ['a b'] }),
      refund: async () => {
        refundCalls++
        return { refunded: refundCalls === 2, balance: 12, refundedAmount: refundCalls === 2 ? 2 : 0 }
      },
    })
    expect(await runScan({ ...REQUEST, actor: USER_ACTOR }, deps)).toEqual({
      ok: false,
      error: { code: 'generation_failed' },
    })
    expect(refundCalls).toBe(2)
    expect(calls.usage.find((row) => row.flow === 'scan')).toMatchObject({ outcome: 'refunded', credits_charged: 0 })
  })

  it('regenerates the ad text once, then gives up with a refund', async () => {
    let calls = 0
    const { deps, calls: fake } = makeDeps({
      generate: (async () => {
        calls++
        return { object: calls === 1 ? PLANNER_OUTPUT : { ...COPY_OUTPUT, headlines: ['Hemen Arayın!'], descriptions: [] }, usage: { inputTokens: 10, outputTokens: 5 } }
      }) as unknown as ScanDeps['generate'],
    })
    const outcome = await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(outcome).toEqual({ ok: false, error: { code: 'generation_failed' } })
    expect(calls).toBe(3)
    expect(fake.release).toBe(1)
    const preview = fake.usage.filter((row) => row.flow === 'preview')
    expect(preview).toHaveLength(1)
    expect(preview[0].input_tokens).toBe(20)
  })

  it('maps a model error to generation_failed and still releases', async () => {
    const { deps, calls } = makeDeps({
      generate: (async () => {
        throw Object.assign(new Error('boom'), { usage: { inputTokens: 7, outputTokens: 0 } })
      }) as unknown as ScanDeps['generate'],
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'generation_failed' } })
    expect(calls.release).toBe(1)
    expect(calls.releasePolicy).toBe(1)
    expect(calls.usage.find((row) => row.flow === 'plan')).toMatchObject({ outcome: 'error', error_code: 'generation_failed', input_tokens: 7 })
  })

  it('retries releasing a policy slot after a technical model failure', async () => {
    let releaseCalls = 0
    const { deps, calls } = makeDeps({
      generate: (async () => {
        throw new Error('temporary model failure')
      }) as unknown as ScanDeps['generate'],
      releasePolicyAttempt: async () => {
        releaseCalls++
        return releaseCalls === 2
      },
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({
      ok: false,
      error: { code: 'generation_failed' },
    })
    expect(releaseCalls).toBe(2)
    expect(calls.release).toBe(1)
  })

  it('times out when the time budget is already spent', async () => {
    let t = 0
    const { deps, calls } = makeDeps({
      now: () => {
        t += 60_000
        return t
      },
    })
    expect(await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)).toEqual({ ok: false, error: { code: 'timeout' } })
    expect(calls.release).toBe(1)
  })

  it('does not leak the boundary token or raw page text into the ad-copy prompt', async () => {
    const { deps, calls } = makeDeps()
    await runScan({ ...REQUEST, actor: ANON_ACTOR }, deps)
    expect(calls.generate[0].prompt).toMatch(/SITE_DATA_[0-9A-F]{18} BEGIN/)
    expect(calls.generate[1].prompt).not.toContain('atölyesinde')
  })
})
