import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  billingReminderDedupeKey,
  isReminderStillApplicable,
  parseBillingReminderKey,
  resolveDueReminder,
  type ReminderSubscription,
} from './billing-reminders-core'
import { buildBillingReminderCopy } from './email/billing-reminder-copy'

const NOW = new Date('2025-06-10T09:00:00.000Z')
const ID = '11111111-2222-3333-4444-555555555555'

function sub(overrides: Partial<ReminderSubscription> = {}): ReminderSubscription {
  return {
    id: ID,
    status: 'active',
    provider: 'iyzico',
    cancel_at_period_end: false,
    current_period_end: new Date(NOW.getTime() + 5 * DAY_MS).toISOString(),
    grace_period_ends_at: null,
    suspended_at: null,
    plan: { price_cents: 29900, interval: 'month' },
    ...overrides,
  }
}

const endIn = (days: number) => new Date(NOW.getTime() + days * DAY_MS).toISOString()

describe('resolveDueReminder', () => {
  it('picks the renewal stage for the days left', () => {
    expect(resolveDueReminder(sub({ current_period_end: endIn(7) }), NOW, 7)?.kind).toBe('renewal_upcoming_7d')
    expect(resolveDueReminder(sub({ current_period_end: endIn(3) }), NOW, 7)?.kind).toBe('renewal_upcoming_3d')
    expect(resolveDueReminder(sub({ current_period_end: endIn(0.5) }), NOW, 7)?.kind).toBe('renewal_upcoming_1d')
    expect(resolveDueReminder(sub({ current_period_end: endIn(20) }), NOW, 7)).toBeNull()
  })

  it('only sends the current stage after downtime, never a backlog', () => {
    expect(resolveDueReminder(sub({ current_period_end: endIn(0.2) }), NOW, 7)?.kind).toBe('renewal_upcoming_1d')
  })

  it('tells a cancelled subscription it is ending, not that it renews', () => {
    expect(resolveDueReminder(sub({ cancel_at_period_end: true, current_period_end: endIn(2) }), NOW, 7)?.kind).toBe(
      'period_ending_notice',
    )
    expect(resolveDueReminder(sub({ cancel_at_period_end: true, current_period_end: endIn(6) }), NOW, 7)).toBeNull()
    expect(resolveDueReminder(sub({ cancel_at_period_end: true, current_period_end: endIn(-1) }), NOW, 7)).toBeNull()
  })

  it('walks the payment failure stages through the grace window', () => {
    const at = (daysAgo: number) => sub({ status: 'past_due', current_period_end: endIn(-daysAgo) })
    expect(resolveDueReminder(at(0.5), NOW, 7)?.kind).toBe('payment_failed')
    expect(resolveDueReminder(at(3), NOW, 7)?.kind).toBe('payment_failed_day2')
    expect(resolveDueReminder(at(6.5), NOW, 7)?.kind).toBe('payment_failed_final')
    expect(resolveDueReminder(at(8), NOW, 7)).toBeNull()
  })

  it('treats an active subscription past its end as a failed payment', () => {
    expect(resolveDueReminder(sub({ current_period_end: endIn(-0.5) }), NOW, 7)?.kind).toBe('payment_failed')
  })

  it('announces a fresh suspension only', () => {
    const suspended = (daysAgo: number) =>
      sub({ status: 'suspended', suspended_at: endIn(-daysAgo), current_period_end: endIn(-10) })
    expect(resolveDueReminder(suspended(1), NOW, 7)?.kind).toBe('subscription_suspended')
    expect(resolveDueReminder(suspended(30), NOW, 7)).toBeNull()
  })

  it('ignores mock, manual, gift, free and one-time subscriptions', () => {
    for (const provider of ['mock', 'manual', 'gift']) {
      expect(resolveDueReminder(sub({ provider }), NOW, 7)).toBeNull()
    }
    expect(resolveDueReminder(sub({ plan: { price_cents: 0, interval: 'month' } }), NOW, 7)).toBeNull()
    expect(resolveDueReminder(sub({ plan: { price_cents: 100, interval: 'once' } }), NOW, 7)).toBeNull()
    expect(resolveDueReminder(sub({ status: 'canceled' }), NOW, 7)).toBeNull()
  })
})

describe('dedupe key', () => {
  it('round-trips and changes with the billing period', () => {
    const periodEnd = endIn(3)
    const key = billingReminderDedupeKey(ID, periodEnd, 'renewal_upcoming_3d')
    expect(parseBillingReminderKey(key)).toEqual({ subscriptionId: ID, periodEnd, kind: 'renewal_upcoming_3d' })
    expect(billingReminderDedupeKey(ID, endIn(33), 'renewal_upcoming_3d')).not.toBe(key)
    expect(parseBillingReminderKey('invoice:abc:def')).toBeNull()
  })
})

describe('isReminderStillApplicable', () => {
  it('drops a payment failure mail once the customer has renewed', () => {
    const queuedFor = endIn(-1)
    const renewed = sub({ current_period_end: endIn(29) })
    expect(isReminderStillApplicable('payment_failed', queuedFor, renewed, NOW, 7)).toBe(false)
  })

  it('keeps a due mail whose subscription is unchanged', () => {
    const past = sub({ status: 'past_due', current_period_end: endIn(-1) })
    expect(isReminderStillApplicable('payment_failed', past.current_period_end!, past, NOW, 7)).toBe(true)
    const upcoming = sub({ current_period_end: endIn(2) })
    expect(isReminderStillApplicable('renewal_upcoming_3d', upcoming.current_period_end!, upcoming, NOW, 7)).toBe(true)
  })

  it('drops a renewal reminder after the customer cancelled', () => {
    const cancelled = sub({ cancel_at_period_end: true, current_period_end: endIn(2) })
    expect(isReminderStillApplicable('renewal_upcoming_3d', cancelled.current_period_end!, cancelled, NOW, 7)).toBe(false)
  })
})

describe('buildBillingReminderCopy', () => {
  it('never puts an amount or an 11-digit identifier in the email', () => {
    const copy = buildBillingReminderCopy({
      kind: 'payment_failed_final',
      lang: 'tr',
      planName: 'PRO',
      periodEnd: endIn(-6),
      graceEnd: new Date(NOW.getTime() + DAY_MS),
      daysLeft: 0,
      sitesUnpublished: false,
      billingUrl: 'https://gloval.ai/billing?renew=1#renew',
      supportEmail: 'destek@gloval.ai',
    })
    const text = JSON.stringify(copy)
    expect(text).not.toMatch(/₺|TL\b|\d{11}/)
    expect(copy.cta.href).toBe('https://gloval.ai/billing?renew=1#renew')
  })
})
