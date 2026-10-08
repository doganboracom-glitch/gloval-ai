import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  sent: new Set<string>(),
  emails: [] as Array<{ userId: string; type: string; body?: string | null }>,
}))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  let wantRows = false
  const run = () => {
    const matched = (state.db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') for (const r of matched) Object.assign(r, patch)
    return matched.map((r) => ({ ...r }))
  }
  const b: Record<string, unknown> = {
    select() {
      if (mode === 'update') wantRows = true
      return b
    },
    update(p: Row) {
      mode = 'update'
      patch = p
      return b
    },
    eq(c: string, v: unknown) {
      filters.push((r) => r[c] === v)
      return b
    },
    in(c: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[c]))
      return b
    },
    lte(c: string, v: string) {
      filters.push((r) => typeof r[c] === 'string' && (r[c] as string) <= v)
      return b
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: mode === 'update' && !wantRows ? null : rows, error: null }).then(res, rej)
    },
  }
  return b
}

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/notify', () => ({
  formatTicketNumber: (s: string) => s,
  logUserEvent: async (input: { userId: string; type: string; body?: string | null; dedupeKey?: string }) => {
    if (input.dedupeKey) {
      if (state.sent.has(input.dedupeKey)) return false
      state.sent.add(input.dedupeKey)
    }
    state.emails.push({ userId: input.userId, type: input.type, body: input.body })
    return true
  },
}))

import { reconcileSubscriptionLifecycle } from './billing-lifecycle'
import { buildLifecycleNotice } from './billing-notices'

const NOW = new Date('2025-06-15T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const daysAhead = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

const sub = (id: string) => state.db.billing_subscriptions.find((s) => s.id === id)!
const project = (id: string) => state.db.projects.find((p) => p.id === id)!

function subscription(id: string, userId: string, status: string, periodEnd: string, extra: Row = {}): Row {
  return {
    id,
    user_id: userId,
    status,
    current_period_end: periodEnd,
    grace_period_ends_at: null,
    suspended_at: null,
    suspension_reason: null,
    suspended_project_ids: [],
    ...extra,
  }
}

function site(id: string, ownerId: string, published = true): Row {
  return { id, owner_id: ownerId, slug: id, published, status: published ? 'published' : 'draft' }
}

function seed(subs: Row[], projects: Row[] = []) {
  state.db = { billing_subscriptions: subs, projects }
}

beforeEach(() => {
  state.sent = new Set()
  state.emails = []
  delete process.env.GRACE_PERIOD
  vi.spyOn(console, 'log').mockImplementation(() => {})
  seed([])
})

describe('reconcileSubscriptionLifecycle - existing expired accounts', () => {
  it('moves a recently expired active subscription to past_due with grace counted from the period end', async () => {
    const periodEnd = daysAgo(1)
    seed([subscription('s1', 'u1', 'active', periodEnd)], [site('a', 'u1')])

    const result = await reconcileSubscriptionLifecycle(NOW)

    expect(sub('s1').status).toBe('past_due')
    expect(sub('s1').grace_period_ends_at).toBe(new Date(new Date(periodEnd).getTime() + 7 * 86_400_000).toISOString())
    expect(project('a').published).toBe(true)
    expect(result).toMatchObject({ detected: 1, markedPastDue: 1, suspended: 0, notified: 1, duplicatesBlocked: 0, sitesSuspended: 0 })
    expect(state.emails.map((e) => e.type)).toEqual(['renewal_payment_failed'])
  })

  it('suspends a long-expired active subscription directly, without a fresh grace window or a stale past_due email', async () => {
    seed([subscription('s1', 'u1', 'active', daysAgo(90))], [site('a', 'u1'), site('b', 'u1'), site('draft', 'u1', false)])

    const result = await reconcileSubscriptionLifecycle(NOW)

    expect(sub('s1').status).toBe('suspended')
    expect(sub('s1').suspension_reason).toBe('grace_period_expired')
    expect(sub('s1').suspended_project_ids).toEqual(['a', 'b'])
    expect(result).toMatchObject({ detected: 1, markedPastDue: 0, suspended: 1, notified: 1, sitesSuspended: 2 })
    expect(state.emails.map((e) => e.type)).toEqual(['subscription_suspended'])
  })

  it('unpublishes live sites on suspension but never deletes projects or content', async () => {
    seed([subscription('s1', 'u1', 'past_due', daysAgo(20), { grace_period_ends_at: daysAgo(13) })], [site('a', 'u1'), site('other', 'u2')])

    await reconcileSubscriptionLifecycle(NOW)

    expect(state.db.projects).toHaveLength(2)
    expect(project('a')).toMatchObject({ published: false, status: 'draft' })
    expect(project('other').published).toBe(true)
  })

  it('suspends a past_due subscription whose stored grace period has passed', async () => {
    seed([subscription('s1', 'u1', 'past_due', daysAgo(10), { grace_period_ends_at: daysAgo(3) })], [site('a', 'u1')])
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(sub('s1').status).toBe('suspended')
    expect(result.suspended).toBe(1)
  })

  it('keeps a past_due subscription inside grace and sends the final warning once the deadline is close', async () => {
    seed([subscription('s1', 'u1', 'past_due', daysAgo(6), { grace_period_ends_at: daysAhead(1) })], [site('a', 'u1')])
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(sub('s1').status).toBe('past_due')
    expect(project('a').published).toBe(true)
    expect(state.emails.map((e) => e.type).sort()).toEqual(['renewal_final_warning', 'renewal_payment_failed'])
    expect(result.suspended).toBe(0)
  })

  it('never emails the same notice twice for the same period, even across repeated cron runs', async () => {
    seed([subscription('s1', 'u1', 'past_due', daysAgo(3), { grace_period_ends_at: daysAhead(4) })])

    const first = await reconcileSubscriptionLifecycle(NOW)
    const second = await reconcileSubscriptionLifecycle(NOW)

    expect(first.notified).toBe(1)
    expect(second.notified).toBe(0)
    expect(second.duplicatesBlocked).toBe(1)
    expect(state.emails).toHaveLength(1)
  })

  it('a duplicate cron run after suspension does nothing: no re-processing, no second email, no second unpublish', async () => {
    seed([subscription('s1', 'u1', 'active', daysAgo(60))], [site('a', 'u1')])

    const first = await reconcileSubscriptionLifecycle(NOW)
    const stamp = sub('s1').suspended_at
    const second = await reconcileSubscriptionLifecycle(NOW)

    expect(first).toMatchObject({ suspended: 1, notified: 1, sitesSuspended: 1 })
    expect(second).toMatchObject({ detected: 0, suspended: 0, notified: 0, sitesSuspended: 0 })
    expect(second.entries).toHaveLength(0)
    expect(sub('s1').suspended_at).toBe(stamp)
    expect(state.emails).toHaveLength(1)
  })

  it('leaves canceled subscriptions and future-dated active subscriptions untouched', async () => {
    seed(
      [subscription('c1', 'u1', 'canceled', daysAgo(40)), subscription('f1', 'u2', 'active', daysAhead(12))],
      [site('a', 'u1'), site('b', 'u2')],
    )
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(sub('c1').status).toBe('canceled')
    expect(sub('f1').status).toBe('active')
    expect(project('a').published).toBe(true)
    expect(project('b').published).toBe(true)
    expect(result.detected).toBe(0)
    expect(state.emails).toHaveLength(0)
  })

  it('does not touch an already suspended account that has no live sites', async () => {
    seed([subscription('s1', 'u1', 'suspended', daysAgo(40), { suspended_project_ids: ['a'] })], [site('a', 'u1', false)])
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(result).toMatchObject({ detected: 0, suspended: 0, notified: 0, sitesSuspended: 0 })
    expect(sub('s1').suspended_project_ids).toEqual(['a'])
  })

  it('unpublishes sites that are still live on an already suspended account and remembers them for restore', async () => {
    seed([subscription('s1', 'u1', 'suspended', daysAgo(40), { suspended_project_ids: ['a'] })], [site('a', 'u1', false), site('live', 'u1')])
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(project('live').published).toBe(false)
    expect(sub('s1').suspended_project_ids).toEqual(['a', 'live'])
    expect(result.sitesSuspended).toBe(1)
    expect(result.notified).toBe(0)
    expect(result.entries[0]).toMatchObject({ outcome: 'sites_unpublished', previousStatus: 'suspended', newStatus: 'suspended' })
  })

  it('reports a per-subscription audit entry for every processed account', async () => {
    seed([subscription('s1', 'u1', 'active', daysAgo(1)), subscription('s2', 'u2', 'active', daysAgo(45))], [site('a', 'u2')])
    const result = await reconcileSubscriptionLifecycle(NOW)
    expect(result.detected).toBe(2)
    expect(result.entries).toEqual([
      expect.objectContaining({ subscriptionId: 's1', userId: 'u1', previousStatus: 'active', newStatus: 'past_due', outcome: 'past_due', notificationsSent: 1 }),
      expect.objectContaining({ subscriptionId: 's2', userId: 'u2', previousStatus: 'active', newStatus: 'suspended', outcome: 'suspended', sitesSuspended: 1 }),
    ])
  })
})

describe('lifecycle notices - renewal link', () => {
  it('points every notice at the billing renewal card (secure renewSubscription checkout), never at a raw payment URL', () => {
    for (const kind of ['past_due', 'grace_warning', 'suspended'] as const) {
      const { body } = buildLifecycleNotice(kind, { subscriptionId: 's1', periodEnd: daysAgo(1), graceEndsAt: new Date(NOW) })
      expect(body).toContain('/billing?renew=1#renew')
      expect(body).not.toMatch(/iyzico|paymentPageUrl/i)
    }
  })

  it('keys notices by subscription and period so the next billing cycle gets fresh notices', () => {
    const a = buildLifecycleNotice('past_due', { subscriptionId: 's1', periodEnd: '2025-05-01T00:00:00.000Z' })
    const b = buildLifecycleNotice('past_due', { subscriptionId: 's1', periodEnd: '2025-06-01T00:00:00.000Z' })
    expect(a.dedupeKey).not.toBe(b.dedupeKey)
  })
})
