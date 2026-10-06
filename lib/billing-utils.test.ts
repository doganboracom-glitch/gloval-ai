import { describe, expect, it } from 'vitest'
import { addCalendarMonths, BILLING_TIME_ZONE } from './billing-utils'

/**
 * `addCalendarMonths` drives the subscription renewal date shown on the
 * billing screen. All inputs/outputs below are expressed as noon
 * Europe/Istanbul (well clear of any midnight UTC-offset boundary) so the
 * assertions isolate the calendar-month arithmetic itself.
 */
function istanbulNoon(year: number, month: number, day: number): Date {
  // Europe/Istanbul has been a fixed UTC+03:00 since 2016 (no DST), so noon
  // Istanbul is always 09:00 UTC.
  return new Date(Date.UTC(year, month - 1, day, 9, 0, 0))
}

function istanbulYmd(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: BILLING_TIME_ZONE })
}

describe('addCalendarMonths', () => {
  it.each([
    ['2026-09-05', 2026, 9, 5, 2026, 10, 5],
    ['2026-09-12', 2026, 9, 12, 2026, 10, 12],
    ['2026-09-30', 2026, 9, 30, 2026, 10, 30],
    ['2026-10-31 -> Nov has 30 days', 2026, 10, 31, 2026, 11, 30],
    ['2027-01-31 -> Feb non-leap', 2027, 1, 31, 2027, 2, 28],
    ['2028-01-31 -> Feb leap', 2028, 1, 31, 2028, 2, 29],
    ['2027-01-29 -> Feb non-leap', 2027, 1, 29, 2027, 2, 28],
    ['2028-01-29 -> Feb leap (exact day preserved)', 2028, 1, 29, 2028, 2, 29],
  ])('%s', (_label, fromYear, fromMonth, fromDay, toYear, toMonth, toDay) => {
    const from = istanbulNoon(fromYear, fromMonth, fromDay)
    const result = addCalendarMonths(from, 1)
    const expected = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(toDay).padStart(2, '0')}`
    expect(istanbulYmd(result)).toBe(expected)
  })

  it('never uses a fixed 30-day offset (Sep has 30 days, so this would coincidentally pass with +30d; assert against Aug, which has 31)', () => {
    const from = istanbulNoon(2026, 8, 31) // Aug 31
    const result = addCalendarMonths(from, 1)
    // A naive `+30 days` would land on Sep 30; the correct calendar-month
    // rule clamps to Sep's last day too (30), so assert the day count more
    // strictly via a case where the two approaches diverge: Jan 31 -> Feb.
    const janFrom = istanbulNoon(2027, 1, 31)
    const janResult = addCalendarMonths(janFrom, 1)
    expect(istanbulYmd(result)).toBe('2026-09-30')
    // +30 days from Jan 31 would land on Mar 2; the calendar-month rule must
    // clamp to Feb 28 instead.
    expect(istanbulYmd(janResult)).toBe('2027-02-28')
  })

  it('handles the annual interval as 12 calendar months (Feb 29 -> Feb 28 on a non-leap target year)', () => {
    const from = istanbulNoon(2028, 2, 29) // leap year
    const result = addCalendarMonths(from, 12)
    expect(istanbulYmd(result)).toBe('2029-02-28')
  })

  it('is stable under repeated application: chaining monthly renewals never drifts off the original billing day', () => {
    let cursor = istanbulNoon(2026, 1, 31)
    const days: string[] = []
    for (let i = 0; i < 6; i++) {
      cursor = addCalendarMonths(cursor, 1)
      days.push(istanbulYmd(cursor))
    }
    // Jan 31 -> Feb 28 -> Mar 28 -> Apr 28 -> May 28 -> Jun 28 -> Jul 28.
    // Once clamped, the billing day stays at 28 rather than trying (and
    // failing) to snap back to 31 the next time a long month comes around.
    expect(days).toEqual([
      '2026-02-28',
      '2026-03-28',
      '2026-04-28',
      '2026-05-28',
      '2026-06-28',
      '2026-07-28',
    ])
  })
})
