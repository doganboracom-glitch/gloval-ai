import { describe, expect, it } from 'vitest'
import { buildLifecycleNotice } from '@/lib/billing-notices'

const sub = { subscriptionId: 'sub_1', periodEnd: '2026-01-01T00:00:00Z' }

describe('buildLifecycleNotice', () => {
  it('is stable for the same subscription and period so repeats dedupe', () => {
    const a = buildLifecycleNotice('past_due', sub)
    const b = buildLifecycleNotice('past_due', sub)
    expect(a.dedupeKey).toBe(b.dedupeKey)
  })

  it('uses distinct keys per kind', () => {
    const keys = (['past_due', 'grace_warning', 'suspended'] as const).map(
      (k) => buildLifecycleNotice(k, sub).dedupeKey,
    )
    expect(new Set(keys).size).toBe(3)
  })

  it('issues fresh keys once a renewal moves the period end', () => {
    const next = { ...sub, periodEnd: '2026-02-01T00:00:00Z' }
    expect(buildLifecycleNotice('suspended', next).dedupeKey).not.toBe(
      buildLifecycleNotice('suspended', sub).dedupeKey,
    )
  })

  it('links to the billing page', () => {
    expect(buildLifecycleNotice('suspended', sub).body).toContain('/billing')
  })
})
