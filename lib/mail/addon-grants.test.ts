import { describe, expect, it } from 'vitest'
import { ADD_ONS, MAIL_ADD_ON_CODES } from '@/lib/add-ons'
import { getMailAddOnCopy } from '@/components/billing/mail-addon-copy'
import { computeMailAccess, subscriptionSourceEndsAt } from './access-state'
import { mailAddonGrantsFromRows, type MailAddonEntitlementRow } from './addon-grants'
import { computeMailboxLimit, grantsToAccessSources, type MailPlanGrant } from './mailbox-limits'

const NOW = new Date('2026-10-10T12:00:00.000Z')
const DAY_MS = 86_400_000
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY_MS).toISOString()

function mailRow(
  code: string,
  sub: { status: string; current_period_end: string | null; grace_period_ends_at?: string | null; updated_at?: string | null } | null,
  overrides: Partial<MailAddonEntitlementRow> = {},
): MailAddonEntitlementRow {
  return {
    addon_code: code,
    status: 'active',
    starts_at: iso(-10),
    expires_at: sub?.current_period_end ?? null,
    subscription_id: sub ? 'sub-1' : null,
    billing_subscriptions: sub
      ? { grace_period_ends_at: null, updated_at: null, ...sub }
      : null,
    ...overrides,
  }
}

const activeSub = { status: 'active', current_period_end: iso(20) }
const proPlan = (): MailPlanGrant => ({ code: 'pro', entitled: true, endsAt: iso(20), endedAt: null })

describe('GLOVAL Mail catalog', () => {
  it('exposes the four packages with the agreed sizes and prices', () => {
    expect(MAIL_ADD_ON_CODES).toEqual(['extra_mail_1', 'extra_mail_10', 'extra_mail_25', 'extra_mail_50'])
    expect(MAIL_ADD_ON_CODES.map((c) => [ADD_ONS[c].capacity, ADD_ONS[c].listPriceCents])).toEqual([
      [1, 4900],
      [10, 14900],
      [25, 29900],
      [50, 49900],
    ])
  })
})

describe('mailAddonGrantsFromRows', () => {
  it('returns no grants when the user has no add-ons', () => {
    expect(mailAddonGrantsFromRows([], NOW)).toEqual([])
  })

  it('maps an active row to a grant sized from the catalog', () => {
    const [grant] = mailAddonGrantsFromRows([mailRow('extra_mail_10', activeSub)], NOW)
    expect(grant.capacity).toBe(10)
    expect(grant.entitled).toBe(true)
    expect(new Date(grant.endsAt as string).toISOString()).toBe(activeSub.current_period_end)
  })

  it('skips site/product add-ons, unknown codes and non-active rows', () => {
    const grants = mailAddonGrantsFromRows(
      [
        mailRow('extra_site_1', activeSub),
        mailRow('extra_product_100', activeSub),
        mailRow('extra_mail_999', activeSub),
        mailRow('extra_mail_1', activeSub, { status: 'cancelled' }),
      ],
      NOW,
    )
    expect(grants).toEqual([])
  })

  it('accepts the subscription as a one-element array (PostgREST shape)', () => {
    const row = mailRow('extra_mail_1', activeSub)
    const [grant] = mailAddonGrantsFromRows([{ ...row, billing_subscriptions: [activeSub as never] }], NOW)
    expect(grant.entitled).toBe(true)
  })

  it('does not entitle a row whose subscription is gone', () => {
    const [grant] = mailAddonGrantsFromRows([mailRow('extra_mail_25', null, { expires_at: iso(-2) })], NOW)
    expect(grant.entitled).toBe(false)
    expect(grant.capacity).toBe(25)
  })

  it('does not entitle a row that has not started yet', () => {
    const [grant] = mailAddonGrantsFromRows([mailRow('extra_mail_1', activeSub, { starts_at: iso(1) })], NOW)
    expect(grant.entitled).toBe(false)
  })

  it('does not entitle once the subscription is cancelled or expired', () => {
    const [grant] = mailAddonGrantsFromRows(
      [mailRow('extra_mail_1', { status: 'canceled', current_period_end: iso(-3), updated_at: iso(-3) })],
      NOW,
    )
    expect(grant.entitled).toBe(false)
    expect(grant.endedAt).toBe(iso(-3))
  })
})

describe('mailbox capacity = plan + active add-ons', () => {
  it('equals the plan allowance when there are no add-ons', () => {
    const limit = computeMailboxLimit({ grants: { plans: [proPlan()], addons: [] }, now: NOW })
    expect(limit).toEqual({ max: 3, fromPlan: 3, fromAddons: 0 })
  })

  it('sums several active add-ons on top of the plan', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_10', activeSub), mailRow('extra_mail_1', activeSub), mailRow('extra_mail_25', activeSub)],
      NOW,
    )
    const limit = computeMailboxLimit({ grants: { plans: [proPlan()], addons }, now: NOW })
    expect(limit).toEqual({ max: 3 + 36, fromPlan: 3, fromAddons: 36 })
  })

  it('ignores an add-on whose subscription period already ended', () => {
    const addons = mailAddonGrantsFromRows(
      [
        mailRow('extra_mail_10', activeSub),
        mailRow('extra_mail_25', { status: 'active', current_period_end: iso(-1) }),
      ],
      NOW,
    )
    const limit = computeMailboxLimit({ grants: { plans: [proPlan()], addons }, now: NOW })
    expect(limit.fromAddons).toBe(10)
    expect(limit.max).toBe(13)
  })

  it('can still show what renewal would restore via countLapsed', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_25', { status: 'active', current_period_end: iso(-1) })],
      NOW,
    )
    const grants = { plans: [proPlan()], addons }
    expect(computeMailboxLimit({ grants, now: NOW }).fromAddons).toBe(0)
    expect(computeMailboxLimit({ grants, now: NOW, countLapsed: true }).fromAddons).toBe(25)
  })
})

describe('mail access state when an add-on ends', () => {
  const access = (grants: { plans: MailPlanGrant[]; addons: ReturnType<typeof mailAddonGrantsFromRows> }) =>
    computeMailAccess({ sources: grantsToAccessSources(grants), now: NOW, graceDays: 14 })

  it('is active while the add-on subscription is valid', () => {
    const addons = mailAddonGrantsFromRows([mailRow('extra_mail_1', activeSub)], NOW)
    const state = access({ plans: [], addons })
    expect(state.status).toBe('active')
    expect(state.validSources).toEqual(['addon'])
  })

  it('moves to grace after the period ends and the plan does not cover mail', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_1', { status: 'active', current_period_end: iso(-4) })],
      NOW,
    )
    const state = access({ plans: [], addons })
    expect(state.status).toBe('grace')
    expect(state.graceDaysRemaining).toBe(10)
  })

  it('suspends once grace is over', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_1', { status: 'active', current_period_end: iso(-30) })],
      NOW,
    )
    expect(access({ plans: [], addons }).status).toBe('suspended')
  })

  it('stays active when the plan still covers mail even though the add-on lapsed', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_10', { status: 'active', current_period_end: iso(-4) })],
      NOW,
    )
    const state = access({ plans: [proPlan()], addons })
    expect(state.status).toBe('active')
    expect(state.validSources).toEqual(['plan'])
  })

  it('uses the same past_due window as a plan source', () => {
    const addons = mailAddonGrantsFromRows(
      [mailRow('extra_mail_1', { status: 'past_due', current_period_end: iso(-5), grace_period_ends_at: iso(2) })],
      NOW,
    )
    expect(subscriptionSourceEndsAt('past_due', iso(-5), iso(2))).toBe(addons[0].endsAt)
    expect(access({ plans: [], addons }).status).toBe('active')
  })
})

describe('GLOVAL Mail copy', () => {
  it('has identical keys in TR and EN and no empty values', () => {
    const tr = getMailAddOnCopy('tr')
    const en = getMailAddOnCopy('en')
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
    for (const copy of [tr, en]) {
      for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders in both languages and falls back to EN', () => {
    const tr = getMailAddOnCopy('tr')
    const en = getMailAddOnCopy('en')
    expect(tr.unit).toContain('{n}')
    expect(en.unit).toContain('{n}')
    expect(tr.successTotal).toContain('{total}')
    expect(en.successTotal).toContain('{total}')
    expect(getMailAddOnCopy('de')).toBe(en)
  })
})
