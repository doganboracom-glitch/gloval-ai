import { describe, expect, it } from 'vitest'
import {
  AI_SUGGESTED_COUNTS,
  LIST_LIMITS,
  canRemoveEntry,
  limitReason,
  type LimitedSectionType,
} from '@/lib/list-limits'
import { buildSiteGenerateSystem } from '@/lib/site-generate-prompt'

const FORMERLY_TWO = [
  'services',
  'features',
  'stats',
  'gallery',
  'portfolio',
  'products',
  'categories',
  'process',
  'faq',
] as const satisfies readonly LimitedSectionType[]

describe('list sections can be trimmed down to a single item', () => {
  it.each(FORMERLY_TWO)('%s accepts one entry and can go from two to one', (type) => {
    expect(LIST_LIMITS[type].min).toBe(1)
    expect(canRemoveEntry(type, 2)).toBe(true)
    expect(canRemoveEntry(type, 1)).toBe(false)
    expect(limitReason(type, 'remove')).toContain('en az 1')
  })

  it('keeps the AI suggested counts inside the schema limits', () => {
    for (const [type, c] of Object.entries(AI_SUGGESTED_COUNTS)) {
      const limit = LIST_LIMITS[type as keyof typeof AI_SUGGESTED_COUNTS]
      expect(c.min).toBeGreaterThanOrEqual(limit.min)
      expect(c.max).toBeLessThanOrEqual(limit.max)
      expect(c.min).toBeLessThanOrEqual(c.max)
    }
  })

  it('tells the generation prompt to aim for fuller lists', () => {
    const system = buildSiteGenerateSystem('bir diş kliniği sitesi', 'tr', 5)
    expect(system).toContain('services 3-6')
    expect(system).toContain('faq 4-6')
  })
})
