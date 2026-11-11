import { describe, expect, it } from 'vitest'
import {
  isTestAccountEmail,
  planDraftReminder,
  resolveDraftReminderConfig,
  turkeyDayNumber,
  turkeyDaysBetween,
  type ReminderRecord,
} from './core'

const NOW = new Date('2026-06-30T07:00:00Z')
const daysAgo = (days: number, base = NOW) => new Date(base.getTime() - days * 86_400_000).toISOString()
const sent = (kind: ReminderRecord['kind'], at: string): ReminderRecord => ({ kind, status: 'sent', createdAt: at })
const plan = (lastActivityAt: string | null, records: ReminderRecord[] = [], dryRun = false, now = NOW) =>
  planDraftReminder({ lastActivityAt, now, records, dryRun })

describe('stage thresholds', () => {
  it('is not due before 7 inactive days', () => {
    expect(plan(daysAgo(5))).toEqual({ skip: 'not_due' })
  })

  it('sends d7 at 7 days', () => {
    expect(plan(daysAgo(7))).toEqual({ kind: 'd7' })
  })

  it('never skips ahead: an old draft with nothing sent only gets d7', () => {
    expect(plan(daysAgo(900))).toEqual({ kind: 'd7' })
  })

  it('moves to d30, m6 and m12 in order once each is due and 14 days apart', () => {
    expect(plan(daysAgo(40), [sent('d7', daysAgo(20))])).toEqual({ kind: 'd30' })
    expect(plan(daysAgo(200), [sent('d7', daysAgo(60)), sent('d30', daysAgo(20))])).toEqual({ kind: 'm6' })
    expect(plan(daysAgo(400), [sent('d7', daysAgo(90)), sent('d30', daysAgo(60)), sent('m6', daysAgo(20))])).toEqual({
      kind: 'm12',
    })
  })

  it('waits for the stage threshold even when 14 days have passed', () => {
    expect(plan(daysAgo(20), [sent('d7', daysAgo(14))])).toEqual({ skip: 'not_due' })
  })
})

describe('spacing and first rollout', () => {
  it('requires 14 days between stages', () => {
    expect(plan(daysAgo(60), [sent('d7', daysAgo(13))])).toEqual({ skip: 'too_soon_after_last' })
    expect(plan(daysAgo(60), [sent('d7', daysAgo(14))])).toEqual({ kind: 'd30' })
  })

  it('an existing old draft receives exactly one stage per run, then waits 14 days', () => {
    const records: ReminderRecord[] = []
    const first = plan(daysAgo(800), records)
    expect(first).toEqual({ kind: 'd7' })
    records.push(sent('d7', NOW.toISOString()))
    expect(plan(daysAgo(800), records)).toEqual({ skip: 'too_soon_after_last' })
    const later = new Date(NOW.getTime() + 14 * 86_400_000)
    expect(plan(daysAgo(800), records, false, later)).toEqual({ kind: 'd30' })
  })
})

describe('activity and completion', () => {
  it('new activity restarts the clock and a sent stage is not repeated', () => {
    const records = [sent('d7', daysAgo(30))]
    expect(plan(daysAgo(3), records)).toEqual({ skip: 'not_due' })
    expect(plan(daysAgo(30), records)).toEqual({ kind: 'd30' })
  })

  it('is silent after m12', () => {
    const all = [sent('d7', daysAgo(300)), sent('d30', daysAgo(250)), sent('m6', daysAgo(100)), sent('m12', daysAgo(30))]
    expect(plan(daysAgo(900), all)).toEqual({ skip: 'sequence_complete' })
  })

  it('skips projects with no known activity', () => {
    expect(plan(null)).toEqual({ skip: 'no_activity' })
  })
})

describe('Turkey day boundaries', () => {
  it('uses UTC+3 midnight, not UTC midnight', () => {
    // 21:30Z is already the next calendar day in Turkey.
    expect(turkeyDayNumber('2026-06-01T20:59:00Z')).toBe(turkeyDayNumber('2026-06-01T00:00:00Z'))
    expect(turkeyDayNumber('2026-06-01T21:00:00Z')).toBe(turkeyDayNumber('2026-06-01T00:00:00Z') + 1)
  })

  it('counts calendar days, so late-evening activity is due 7 Turkey days later', () => {
    const lastActivity = '2026-06-01T20:00:00Z' // 23:00 on 1 June in Turkey
    const morning = new Date('2026-06-08T07:00:00Z') // 10:00 on 8 June in Turkey
    expect(turkeyDaysBetween(lastActivity, morning)).toBe(7)
    expect(plan(lastActivity, [], false, morning)).toEqual({ kind: 'd7' })
    const justBefore = new Date('2026-06-07T20:59:00Z') // 23:59 on 7 June in Turkey
    expect(plan(lastActivity, [], false, justBefore)).toEqual({ skip: 'not_due' })
  })
})

describe('failures and dry run', () => {
  const failed = (at: string): ReminderRecord => ({ kind: 'd7', status: 'failed', createdAt: at })

  it('retries a failed stage on a later day', () => {
    expect(plan(daysAgo(10), [failed(daysAgo(1))])).toEqual({ kind: 'd7' })
  })

  it('does not retry twice on the same Turkey day', () => {
    expect(plan(daysAgo(10), [failed(NOW.toISOString())])).toEqual({ skip: 'already_attempted_today' })
  })

  it('stops after 3 failed attempts', () => {
    expect(plan(daysAgo(10), [failed(daysAgo(2)), failed(daysAgo(1)), failed(daysAgo(0.5))])).toEqual({
      skip: 'retries_exhausted',
    })
  })

  it('stops retrying 3 days after the first failure', () => {
    expect(plan(daysAgo(10), [failed(daysAgo(3))])).toEqual({ skip: 'retries_exhausted' })
  })

  it('does not write the same dry run twice, but a stale dry run never blocks a live send', () => {
    const dry: ReminderRecord = { kind: 'd7', status: 'dry_run', createdAt: daysAgo(1) }
    expect(plan(daysAgo(10), [dry], true)).toEqual({ skip: 'dry_run_recorded' })
    expect(plan(daysAgo(10), [dry], false)).toEqual({ kind: 'd7' })
  })

  it('does not treat a dry run as a sent stage', () => {
    const dry: ReminderRecord = { kind: 'd7', status: 'dry_run', createdAt: daysAgo(30) }
    expect(plan(daysAgo(40), [dry], true)).toEqual({ skip: 'dry_run_recorded' })
  })
})

describe('configuration', () => {
  it('defaults to disabled, dry run on, 50 per run', () => {
    expect(resolveDraftReminderConfig({})).toEqual({ enabled: false, dryRun: true, maxPerRun: 50 })
  })

  it('only an explicit false disables dry run, and the cap is clamped', () => {
    expect(resolveDraftReminderConfig({ DRAFT_REMINDERS_AUTO_ENABLED: 'true', DRAFT_REMINDERS_DRY_RUN: 'false', DRAFT_REMINDERS_MAX_PER_RUN: '7' })).toEqual({
      enabled: true,
      dryRun: false,
      maxPerRun: 7,
    })
    expect(resolveDraftReminderConfig({ DRAFT_REMINDERS_DRY_RUN: 'maybe', DRAFT_REMINDERS_MAX_PER_RUN: 'abc' }).dryRun).toBe(true)
    expect(resolveDraftReminderConfig({ DRAFT_REMINDERS_MAX_PER_RUN: '99999' }).maxPerRun).toBe(500)
  })
})

describe('test account detection', () => {
  it('flags QA mailboxes only', () => {
    expect(isTestAccountEmail('test@gloval.ai')).toBe(true)
    expect(isTestAccountEmail('Test+qa@gloval.ai')).toBe(true)
    expect(isTestAccountEmail('someone@example.com')).toBe(true)
    expect(isTestAccountEmail('ayse@gmail.com')).toBe(false)
    expect(isTestAccountEmail('testimonials@gloval.ai')).toBe(false)
    expect(isTestAccountEmail(null)).toBe(false)
  })
})
