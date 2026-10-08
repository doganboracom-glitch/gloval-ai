import { describe, expect, it } from 'vitest'
import { AI_CREDIT_CONFIG } from '@/lib/pricing-config'
import {
  isPlanCreditDryRun,
  planGrantReason,
  previewPlanGrant,
  resolveCreditPeriod,
  resolveGrantRule,
  sweepPlanCredits,
  type GrantResult,
  type LedgerEntry,
  type PlanCreditStore,
  type PlanCreditSubscription,
} from '@/lib/plan-credit-sweep'

const NOW = new Date('2026-10-08T12:00:00.000Z')

function sub(overrides: Partial<PlanCreditSubscription> = {}): PlanCreditSubscription {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'active',
    planCode: 'ecommerce',
    productCategory: 'ecommerce',
    interval: 'month',
    periodStart: '2026-10-08T10:47:06.158Z',
    periodEnd: '2026-11-08T10:47:06.158Z',
    ...overrides,
  }
}

/** In-memory ledger that behaves like the SQL function for the fields the sweep reads. */
function memoryStore(subscriptions: PlanCreditSubscription[], ledger: LedgerEntry[] = []) {
  const grants: Array<{ subscriptionId: string; periodRef: string }> = []
  const store: PlanCreditStore = {
    async listPage(afterId, limit) {
      return subscriptions.filter((s) => afterId === null || s.id > afterId).sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit)
    },
    async findGrantedReasons(reasons) {
      return new Set(ledger.filter((row) => row.reason && reasons.includes(row.reason)).map((row) => row.reason as string))
    },
    async loadLedger() {
      return ledger
    },
    async grant({ subscriptionId, periodRef, rule }) {
      grants.push({ subscriptionId, periodRef })
      const reason = planGrantReason(subscriptionId, new Date(periodRef))
      if (ledger.some((row) => row.reason === reason)) {
        return { granted: 0, expired: 0, balance: 0, duplicate: true, firstPeriod: false } satisfies GrantResult
      }
      const first = !ledger.some((row) => row.reason?.startsWith(`plan_grant:${subscriptionId}:`))
      const amount = first ? rule.firstCredits : rule.periodCredits
      ledger.push({ kind: 'package', amount, reason, created_at: NOW.toISOString() })
      return { granted: amount, expired: 0, balance: amount, duplicate: false, firstPeriod: first }
    },
  }
  return { store, grants, ledger }
}

describe('resolveGrantRule', () => {
  it('reads every number from AI_CREDIT_CONFIG', () => {
    expect(resolveGrantRule('pro')).toMatchObject({
      firstCredits: AI_CREDIT_CONFIG.pro.initialCredits,
      periodCredits: AI_CREDIT_CONFIG.pro.monthlyCredits,
      maxBalance: AI_CREDIT_CONFIG.pro.maxBalance,
      expireUnused: !AI_CREDIT_CONFIG.pro.rollover,
    })
    expect(resolveGrantRule('ecommerce').maxBalance).toBe(AI_CREDIT_CONFIG.ecommerce.maxBalance)
    expect(resolveGrantRule('starter')).toMatchObject({ maxBalance: null, expireUnused: !AI_CREDIT_CONFIG.starter.rollover })
  })
})

describe('resolveCreditPeriod', () => {
  it('gives a monthly payment exactly one window, starting at the period start', () => {
    const start = new Date('2026-10-08T10:47:06.158Z')
    const period = resolveCreditPeriod('pro', start, new Date('2026-11-08T10:47:06.158Z'), NOW)
    expect(period?.index).toBe(0)
    expect(period?.start.toISOString()).toBe(start.toISOString())
  })

  it('moves a yearly PRO payment through twelve monthly windows', () => {
    const start = new Date('2026-01-10T09:00:00.000Z')
    const end = new Date('2027-01-10T09:00:00.000Z')
    expect(resolveCreditPeriod('pro', start, end, new Date('2026-01-20T00:00:00.000Z'))?.index).toBe(0)
    expect(resolveCreditPeriod('pro', start, end, new Date('2026-04-12T00:00:00.000Z'))?.index).toBe(3)
    expect(resolveCreditPeriod('pro', start, end, new Date('2026-12-20T00:00:00.000Z'))?.index).toBe(11)
  })

  it('keeps a monthly STARTER payment (31 days) to one 30-day window', () => {
    const start = new Date('2026-10-01T00:00:00.000Z')
    const end = new Date('2026-11-01T00:00:00.000Z')
    const period = resolveCreditPeriod('starter', start, end, new Date('2026-10-31T12:00:00.000Z'))
    expect(period?.index).toBe(0)
  })

  it('gives a yearly STARTER payment twelve windows and stretches the last one', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    const end = new Date('2027-01-01T00:00:00.000Z')
    const step = AI_CREDIT_CONFIG.starter.creditPeriodDays * 24 * 60 * 60 * 1000
    const second = resolveCreditPeriod('starter', start, end, new Date(start.getTime() + step + 1000))
    expect(second?.index).toBe(1)
    const late = resolveCreditPeriod('starter', start, end, new Date('2026-12-30T00:00:00.000Z'))
    expect(late?.index).toBe(11)
  })

  it('grants nothing outside the paid period', () => {
    const start = new Date('2026-09-01T00:00:00.000Z')
    const end = new Date('2026-10-01T00:00:00.000Z')
    expect(resolveCreditPeriod('pro', start, end, NOW)).toBeNull()
    expect(resolveCreditPeriod('pro', new Date('2026-12-01T00:00:00.000Z'), null, NOW)).toBeNull()
  })
})

describe('previewPlanGrant', () => {
  const rule = resolveGrantRule('pro')
  const start = new Date('2026-10-08T10:47:06.158Z')

  it('pays the first-period amount once and the monthly amount afterwards', () => {
    expect(previewPlanGrant([], rule, 'sub-1', start)).toMatchObject({ firstPeriod: true, granted: Math.min(rule.firstCredits, rule.maxBalance ?? Infinity) })
    const ledger: LedgerEntry[] = [
      { kind: 'package', amount: rule.firstCredits, reason: planGrantReason('sub-1', new Date('2026-09-08T10:47:06.158Z')), created_at: '2026-09-08T10:47:06.158Z' },
    ]
    expect(previewPlanGrant(ledger, rule, 'sub-1', start).firstPeriod).toBe(false)
  })

  it('treats a period that was already written as a duplicate', () => {
    const ledger: LedgerEntry[] = [{ kind: 'package', amount: 500, reason: planGrantReason('sub-1', start), created_at: NOW.toISOString() }]
    expect(previewPlanGrant(ledger, rule, 'sub-1', start).duplicate).toBe(true)
  })

  it('never lets the TOTAL balance pass the ceiling', () => {
    const ceiling = rule.maxBalance as number
    const ledger: LedgerEntry[] = [{ kind: 'gift', amount: ceiling - 10, reason: null, created_at: '2026-01-01T00:00:00.000Z' }]
    expect(previewPlanGrant(ledger, rule, 'sub-1', start).granted).toBe(Math.min(rule.firstCredits, 10))
  })

  it('expires the unused part of the previous grant on a non-rollover plan', () => {
    const starter = resolveGrantRule('starter')
    const ledger: LedgerEntry[] = [
      { kind: 'package', amount: 150, reason: planGrantReason('sub-1', new Date('2026-09-08T00:00:00.000Z')), created_at: '2026-09-08T00:00:00.000Z' },
      { kind: 'usage', amount: -40, reason: null, created_at: '2026-09-20T00:00:00.000Z' },
    ]
    const preview = previewPlanGrant(ledger, starter, 'sub-1', start)
    expect(starter.expireUnused).toBe(true)
    expect(preview.expired).toBe(110)
  })
})

describe('sweepPlanCredits', () => {
  it('dry run reports what would be granted and writes nothing', async () => {
    const { store, grants, ledger } = memoryStore([sub()])
    const summary = await sweepPlanCredits({ store, dryRun: true, now: NOW })
    expect(summary.wouldGrant).toHaveLength(1)
    expect(summary.wouldGrant[0]).toMatchObject({ subscriptionId: 'sub-1', plan: 'ecommerce', cycle: 'monthly', firstPeriod: true })
    expect(grants).toHaveLength(0)
    expect(ledger).toHaveLength(0)
  })

  it('a live run is idempotent: the second run writes nothing', async () => {
    const { store, grants } = memoryStore([sub()])
    const first = await sweepPlanCredits({ store, dryRun: false, now: NOW })
    const second = await sweepPlanCredits({ store, dryRun: false, now: NOW })
    expect(first.granted).toHaveLength(1)
    expect(second.granted).toHaveLength(0)
    expect(second.alreadyGranted).toBe(1)
    expect(grants).toHaveLength(1)
  })

  it('skips FREE, add-ons (even when the code contains "pro"), inactive and unpaid-period subscriptions', async () => {
    const { store, grants } = memoryStore([
      sub({ id: 'a', planCode: 'free', productCategory: 'corporate' }),
      sub({ id: 'b', planCode: 'extra_product_100', productCategory: 'addon' }),
      sub({ id: 'c', status: 'past_due' }),
      sub({ id: 'd', periodStart: '2026-08-27T18:26:31.414Z', periodEnd: '2026-09-27T18:26:31.414Z' }),
    ])
    const summary = await sweepPlanCredits({ store, dryRun: false, now: NOW })
    expect(grants).toHaveLength(0)
    expect(summary.skipped).toEqual({ inactive: 1, notCreditPlan: 2, noPaidPeriod: 1 })
  })

  it('isolates a failing subscription and keeps going', async () => {
    const { store } = memoryStore([sub({ id: 'a' }), sub({ id: 'b' })])
    const failing: PlanCreditStore = {
      ...store,
      async grant(args) {
        if (args.subscriptionId === 'a') throw new Error('boom')
        return store.grant(args)
      },
    }
    const summary = await sweepPlanCredits({ store: failing, dryRun: false, now: NOW })
    expect(summary.errors).toEqual([{ subscriptionId: 'a', code: 'grant_failed' }])
    expect(summary.granted.map((g) => g.subscriptionId)).toEqual(['b'])
  })

  it('stops at the deadline and reports truncation', async () => {
    const { store } = memoryStore([sub()])
    const summary = await sweepPlanCredits({ store, dryRun: true, now: NOW, deadlineMs: Date.now() - 1 })
    expect(summary.truncated).toBe(true)
    expect(summary.wouldGrant).toHaveLength(0)
  })
})

describe('isPlanCreditDryRun', () => {
  it('is a dry run unless the variable is exactly "false"', () => {
    expect(isPlanCreditDryRun(undefined)).toBe(true)
    expect(isPlanCreditDryRun('')).toBe(true)
    expect(isPlanCreditDryRun('0')).toBe(true)
    expect(isPlanCreditDryRun('false')).toBe(false)
    expect(isPlanCreditDryRun(' FALSE ')).toBe(false)
  })
})
