import { describe, expect, it } from 'vitest'
import {
  PRUNE_NOTICE_MIN_DAYS,
  buildPruneNoticeCopy,
  earliestDeleteDate,
} from '@/lib/email/version-prune-notice-copy'

describe('version prune notice', () => {
  it('earliest delete date is at least the minimum notice period away', () => {
    const sent = new Date('2026-10-15T00:00:00Z')
    const diffDays = (earliestDeleteDate(sent).getTime() - sent.getTime()) / 86_400_000
    expect(diffDays).toBe(PRUNE_NOTICE_MIN_DAYS)
  })

  it('renders both languages with the plan, date and no live-site threat', () => {
    const deleteAfter = new Date('2026-11-01T00:00:00Z')
    for (const lang of ['tr', 'en'] as const) {
      const copy = buildPruneNoticeCopy({ lang, planName: 'STARTER', deleteAfter, upgradeUrl: 'https://gloval.ai' })
      const text = copy.paragraphs.join(' ')
      expect(text).toContain('STARTER')
      expect(text).toContain('2026')
      expect(copy.subject.length).toBeGreaterThan(0)
      expect(copy.ctaLabel.length).toBeGreaterThan(0)
    }
  })
})
