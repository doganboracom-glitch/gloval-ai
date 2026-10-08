import { describe, expect, it } from 'vitest'
import { PAGE_LIMITS } from '@/lib/pricing-config'
import {
  capPagesToLimit,
  isPageGrowthBlocked,
  pageLimitForPlan,
  pageLimitMessage,
} from '@/lib/page-limits'

describe('page limits', () => {
  it('resolves limits from PAGE_LIMITS and treats unknown plans as free', () => {
    expect(pageLimitForPlan('starter')).toBe(PAGE_LIMITS.starter)
    expect(pageLimitForPlan('pro')).toBe(PAGE_LIMITS.pro)
    expect(pageLimitForPlan(null)).toBe(PAGE_LIMITS.free)
    expect(pageLimitForPlan('nonsense')).toBe(PAGE_LIMITS.free)
  })

  it('only blocks growth past the limit', () => {
    expect(isPageGrowthBlocked(3, 4, 5)).toBe(false)
    expect(isPageGrowthBlocked(5, 6, 5)).toBe(true)
    // Already over the limit: keeping or shrinking is always allowed.
    expect(isPageGrowthBlocked(8, 8, 5)).toBe(false)
    expect(isPageGrowthBlocked(8, 6, 5)).toBe(false)
    // ...but adding more is not.
    expect(isPageGrowthBlocked(8, 9, 5)).toBe(true)
  })

  it('caps generated pages while keeping the home page first', () => {
    const site = {
      pages: [
        { slug: 'a', title: 'A' },
        { slug: 'home', title: 'Home', isHome: true },
        { slug: 'b', title: 'B' },
        { slug: 'c', title: 'C' },
      ],
    }
    const capped = capPagesToLimit(site, 2)
    expect(capped.pages).toHaveLength(2)
    expect(capped.pages.some((p) => p.isHome)).toBe(true)
    expect(capPagesToLimit(site, 10)).toBe(site)
  })

  it('localizes the refusal message', () => {
    expect(pageLimitMessage('en', 5, 5)).toContain('up to 5 pages')
    expect(pageLimitMessage('tr', 5, 5)).toContain('5 sayfa')
  })
})
