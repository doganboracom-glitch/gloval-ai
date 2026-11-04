import { describe, expect, it } from 'vitest'
import {
  addOnReminderName,
  buildAddOnReminderCopy,
  daysLeft,
  reminderDedupeKey,
  resolveReminderStage,
} from './addon-expiry-reminder-core'

const NOW = new Date('2026-05-01T09:00:00Z')
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString()

describe('resolveReminderStage', () => {
  it('maps the remaining time to a stage', () => {
    expect(resolveReminderStage(inDays(29), NOW)).toBe('30d')
    expect(resolveReminderStage(inDays(30), NOW)).toBe('30d')
    expect(resolveReminderStage(inDays(8), NOW)).toBe('30d')
    expect(resolveReminderStage(inDays(7), NOW)).toBe('7d')
    expect(resolveReminderStage(inDays(1), NOW)).toBe('7d')
  })

  it('never reminds outside the window or for bad input', () => {
    expect(resolveReminderStage(inDays(31), NOW)).toBeNull()
    expect(resolveReminderStage(inDays(-1), NOW)).toBeNull()
    expect(resolveReminderStage(null, NOW)).toBeNull()
    expect(resolveReminderStage('not-a-date', NOW)).toBeNull()
  })
})

describe('reminder copy', () => {
  it('keys stages separately so each is sent once', () => {
    expect(reminderDedupeKey('abc', '30d')).not.toBe(reminderDedupeKey('abc', '7d'))
  })

  it('counts whole days, at least one', () => {
    expect(daysLeft(inDays(7), NOW)).toBe(7)
    expect(daysLeft(new Date(NOW.getTime() + 1000).toISOString(), NOW)).toBe(1)
  })

  it('builds Turkish and English copy with the day count', () => {
    const tr = buildAddOnReminderCopy({ lang: 'tr', addOnName: addOnReminderName('extra_mail_5_yearly', 'tr'), expiresAt: inDays(7), days: 7 })
    expect(tr.subject).toContain('7 gün')
    expect(tr.subject).toContain('5 e-posta kutusu')
    const en = buildAddOnReminderCopy({ lang: 'en', addOnName: addOnReminderName('extra_ecommerce_site_1_yearly', 'en'), expiresAt: inDays(30), days: 30 })
    expect(en.subject).toContain('30 days')
    expect(en.subject).toContain('e-commerce site')
  })

  it('falls back to a generic name for unknown codes', () => {
    expect(addOnReminderName('nope', 'tr')).toBe('Ek paket')
  })
})
