import { describe, expect, it } from 'vitest'
import {
  classifyOverdue,
  computeSettledPeriod,
  daysOverdue,
  isProviderManaged,
  isRecentDuplicate,
  paidMonthsForInterval,
  sanitizeIdempotencyToken,
  settledSubscriptionState,
  validateSettlementInput,
  whatsappNumber,
} from './overdue-logic'

const NOW = new Date('2026-10-08T12:00:00Z')
const base = { status: 'past_due', currentPeriodEnd: '2026-10-01T00:00:00Z', cancelAtPeriodEnd: false, suspensionReason: null, planPriceCents: 10000 }

describe('classifyOverdue', () => {
  it('flags past_due and expired active/trialing periods', () => {
    expect(classifyOverdue(base, NOW)).toBe('past_due')
    expect(classifyOverdue({ ...base, status: 'active' }, NOW)).toBe('period_expired')
    expect(classifyOverdue({ ...base, status: 'trialing' }, NOW)).toBe('period_expired')
  })
  it('flags suspended only when the reason is non-payment', () => {
    expect(classifyOverdue({ ...base, status: 'suspended', suspensionReason: 'renewal_payment_failed' }, NOW)).toBe('payment_failed_suspended')
    expect(classifyOverdue({ ...base, status: 'suspended', suspensionReason: 'grace_period_expired' }, NOW)).toBe('payment_failed_suspended')
    expect(classifyOverdue({ ...base, status: 'suspended', suspensionReason: 'admin' }, NOW)).toBeNull()
  })
  it('ignores free plans, cancel-at-period-end, future periods and canceled', () => {
    expect(classifyOverdue({ ...base, planPriceCents: 0 }, NOW)).toBeNull()
    expect(classifyOverdue({ ...base, status: 'active', cancelAtPeriodEnd: true }, NOW)).toBeNull()
    expect(classifyOverdue({ ...base, status: 'active', currentPeriodEnd: '2026-11-01T00:00:00Z' }, NOW)).toBeNull()
    expect(classifyOverdue({ ...base, status: 'canceled' }, NOW)).toBeNull()
  })
})

describe('daysOverdue', () => {
  it('counts whole days and floors at zero', () => {
    expect(daysOverdue('2026-10-01T12:00:00Z', NOW)).toBe(7)
    expect(daysOverdue('2026-10-20T00:00:00Z', NOW)).toBe(0)
    expect(daysOverdue(null, NOW)).toBe(0)
  })
})

describe('computeSettledPeriod', () => {
  it('restarts from now when the period already ended', () => {
    const { start, end } = computeSettledPeriod({ currentPeriodEnd: '2026-10-01T00:00:00Z', months: 1, now: NOW })
    expect(start).toEqual(NOW)
    expect(end.toISOString()).toBe('2026-11-08T12:00:00.000Z')
  })
  it('extends from the current end when it is still in the future', () => {
    const { start, end } = computeSettledPeriod({ currentPeriodEnd: '2026-10-20T00:00:00Z', months: 2, now: NOW })
    expect(start.toISOString()).toBe('2026-10-20T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-20T00:00:00.000Z')
  })
  it('treats a missing end as expired', () => {
    expect(computeSettledPeriod({ currentPeriodEnd: null, months: 12, now: NOW }).end.toISOString()).toBe('2027-10-08T12:00:00.000Z')
  })
})

describe('settledSubscriptionState', () => {
  it('clears grace and suspension and activates', () => {
    expect(settledSubscriptionState()).toEqual({
      status: 'active',
      grace_period_ends_at: null,
      suspended_at: null,
      suspension_reason: null,
      suspended_project_ids: [],
    })
  })
})

describe('validateSettlementInput', () => {
  const ok = { kind: 'mark_paid' as const, reason: 'EFT alindi', planPriceCents: 5000, status: 'past_due' }
  it('accepts a paid plan with a reason', () => {
    expect(validateSettlementInput(ok)).toEqual({ ok: true, reason: 'EFT alindi', months: 0 })
  })
  it('requires a reason of at least 3 characters', () => {
    expect(validateSettlementInput({ ...ok, reason: '  ab ' })).toEqual({ ok: false, error: 'reason_required' })
    expect(validateSettlementInput({ ...ok, reason: undefined })).toEqual({ ok: false, error: 'reason_required' })
  })
  it('rejects canceled/incomplete subscriptions', () => {
    expect(validateSettlementInput({ ...ok, status: 'canceled' })).toEqual({ ok: false, error: 'subscription_not_settleable' })
    expect(validateSettlementInput({ ...ok, status: 'incomplete' })).toEqual({ ok: false, error: 'subscription_not_settleable' })
  })
  it('rejects a payment on a free plan but allows a gift', () => {
    expect(validateSettlementInput({ ...ok, planPriceCents: 0 })).toEqual({ ok: false, error: 'free_plan_no_payment' })
    expect(validateSettlementInput({ ...ok, kind: 'gift', planPriceCents: 0, months: 2 })).toEqual({ ok: true, reason: 'EFT alindi', months: 2 })
  })
  it('only allows 1, 2 or 3 gift months', () => {
    expect(validateSettlementInput({ ...ok, kind: 'gift', months: 4 })).toEqual({ ok: false, error: 'invalid_months' })
    expect(validateSettlementInput({ ...ok, kind: 'gift', months: 0 })).toEqual({ ok: false, error: 'invalid_months' })
  })
})

describe('duplicate and key guards', () => {
  it('detects an action inside the 60s window only', () => {
    expect(isRecentDuplicate('2026-10-08T11:59:30Z', NOW)).toBe(true)
    expect(isRecentDuplicate('2026-10-08T11:58:00Z', NOW)).toBe(false)
    expect(isRecentDuplicate(null, NOW)).toBe(false)
  })
  it('accepts only well-formed idempotency tokens', () => {
    expect(sanitizeIdempotencyToken('a'.repeat(32))).toBe('a'.repeat(32))
    expect(sanitizeIdempotencyToken('short')).toBeNull()
    expect(sanitizeIdempotencyToken('bad key with spaces!!!!!!')).toBeNull()
  })
})

describe('misc helpers', () => {
  it('maps plan interval to paid months', () => {
    expect(paidMonthsForInterval('year')).toBe(12)
    expect(paidMonthsForInterval('month')).toBe(1)
  })
  it('flags external PSPs as provider-managed', () => {
    expect(isProviderManaged('iyzico')).toBe(true)
    expect(isProviderManaged('mock')).toBe(false)
    expect(isProviderManaged('manual')).toBe(false)
  })
  it('builds wa.me numbers', () => {
    expect(whatsappNumber('0532 123 45 67')).toBe('905321234567')
    expect(whatsappNumber('+90 532 123 45 67')).toBe('905321234567')
    expect(whatsappNumber('5321234567')).toBe('905321234567')
    expect(whatsappNumber('')).toBeNull()
  })
})
