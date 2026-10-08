import { describe, expect, it } from 'vitest'
import { computeMailAccess, subscriptionSourceEndsAt, type MailAccessSource } from './access-state'

const NOW = new Date('2026-10-10T12:00:00.000Z')
const DAY_MS = 86_400_000
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY_MS).toISOString()

/** Builds the plan source exactly like `loadMailPlanSources` does for a subscription row. */
function planSource(row: {
  status: string
  current_period_end: string | null
  grace_period_ends_at: string | null
  updated_at?: string | null
}): MailAccessSource {
  const entitled = ['trialing', 'active', 'past_due'].includes(row.status)
  return {
    kind: 'plan',
    entitled,
    endsAt: subscriptionSourceEndsAt(row.status, row.current_period_end, row.grace_period_ends_at),
    endedAt: entitled ? null : (row.updated_at ?? null),
  }
}

const compute = (source: MailAccessSource) => computeMailAccess({ sources: [source], now: NOW, graceDays: 14 })

describe('mail access for a past_due plan', () => {
  it('stays active while the billing grace window is still open', () => {
    const state = compute(
      planSource({ status: 'past_due', current_period_end: iso(-5), grace_period_ends_at: iso(2) }),
    )
    expect(state.status).toBe('active')
    expect(state.validSources).toEqual(['plan'])
    expect(state.graceStartedAt).toBeNull()
  })

  it('starts mail grace at grace_period_ends_at once the billing grace has passed', () => {
    const graceEnd = iso(-3)
    const state = compute(
      planSource({ status: 'past_due', current_period_end: iso(-10), grace_period_ends_at: graceEnd }),
    )
    expect(state.status).toBe('grace')
    expect(state.graceStartedAt?.toISOString()).toBe(graceEnd)
    expect(state.graceEndsAt?.toISOString()).toBe(iso(11))
    expect(state.validSources).toEqual([])
  })

  it('keeps the old behaviour when grace_period_ends_at is null', () => {
    const periodEnd = iso(-4)
    const state = compute(planSource({ status: 'past_due', current_period_end: periodEnd, grace_period_ends_at: null }))
    expect(state.status).toBe('grace')
    expect(state.graceStartedAt?.toISOString()).toBe(periodEnd)
  })

  it('uses current_period_end when it is later than grace_period_ends_at', () => {
    expect(subscriptionSourceEndsAt('past_due', iso(5), iso(1))).toBe(iso(5))
  })

  it('keeps an open-ended period open-ended', () => {
    expect(subscriptionSourceEndsAt('past_due', null, iso(1))).toBeNull()
  })
})

describe('mail access for other subscription states (unchanged)', () => {
  it('a canceled subscription ignores grace_period_ends_at', () => {
    const periodEnd = iso(-6)
    const updatedAt = iso(-8)
    const source = planSource({
      status: 'canceled',
      current_period_end: periodEnd,
      grace_period_ends_at: iso(5),
      updated_at: updatedAt,
    })
    expect(source.endsAt).toBe(periodEnd)
    const state = compute(source)
    expect(state.status).toBe('grace')
    expect(state.graceStartedAt?.toISOString()).toBe(updatedAt)
  })

  it('a suspended subscription ignores grace_period_ends_at', () => {
    const periodEnd = iso(-6)
    const state = compute(
      planSource({ status: 'suspended', current_period_end: periodEnd, grace_period_ends_at: iso(5), updated_at: iso(-1) }),
    )
    expect(state.status).toBe('grace')
    expect(state.graceStartedAt?.toISOString()).toBe(periodEnd)
  })

  it('an active subscription keeps current_period_end', () => {
    expect(subscriptionSourceEndsAt('active', iso(10), iso(20))).toBe(iso(10))
  })
})
