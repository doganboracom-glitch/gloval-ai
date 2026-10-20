import { describe, expect, it } from 'vitest'
import { BLOG_MAX_POSTS } from '@/lib/blog'
import { PINNED_ITEM_IDS, buildComparison, buildPlanView, splitPlanItems } from '@/lib/plan-copy'
import {
  AI_CREDIT_CONFIG,
  PAGE_LIMITS,
  PLANS,
  SITE_LIMITS,
  type PlanCode,
} from '@/lib/pricing-config'

const CODES: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']
const LANGS = ['tr', 'en'] as const

const LABELS = {
  tr: { blog: 'Site blogu (ayrı blog sayfaları + AI yazı üretimi)', ai: 'AI yazı üretimi (kredi ile)', group: 'İçerik ve blog' },
  en: { blog: 'Site blog (separate blog pages + AI post writing)', ai: 'AI post writing (uses credits)', group: 'Content and blog' },
} as const

describe('blog rows in plan copy', () => {
  for (const lang of LANGS) {
    it(`${lang}: FREE and STARTER cards list both blog rows with the credit wording`, () => {
      for (const code of ['free', 'starter'] as const) {
        const items = buildPlanView(code, 'yearly', lang).groups.flatMap((g) => g.items)
        expect(items.find((i) => i.id === 'blog')?.label).toBe(LABELS[lang].blog)
        const ai = items.find((i) => i.id === 'blogAi')
        expect(ai?.label).toBe(LABELS[lang].ai)
        expect(ai?.excluded).toBeFalsy()
        expect(ai?.note).toContain(BLOG_MAX_POSTS.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US'))
      }
    })

    it(`${lang}: PRO and E-COMMERCE cards inherit the blog rows instead of repeating them`, () => {
      for (const code of ['pro', 'ecommerce'] as const) {
        const ids = buildPlanView(code, 'yearly', lang).groups.flatMap((g) => g.items.map((i) => i.id))
        expect(ids).not.toContain('blog')
        expect(ids).not.toContain('blogAi')
      }
    })

    it(`${lang}: the blog row is visible on collapsed FREE and STARTER cards, within the first five`, () => {
      for (const code of ['free', 'starter'] as const) {
        const featured = splitPlanItems(buildPlanView(code, 'yearly', lang)).featured.map((i) => i.id)
        expect(featured.indexOf('blog')).toBeGreaterThanOrEqual(0)
        expect(featured.indexOf('blog')).toBeLessThan(5)
      }
      expect(PINNED_ITEM_IDS.free).toContain('blog')
      expect(PINNED_ITEM_IDS.starter).toContain('blog')
    })

    it(`${lang}: comparison table has a content group and every plan has the blog (no plan gate)`, () => {
      const comparison = buildComparison(lang)
      const group = comparison.find((g) => g.category === LABELS[lang].group)
      expect(group, 'content group').toBeDefined()
      expect(group!.rows.map((r) => r.label)).toEqual([LABELS[lang].blog, LABELS[lang].ai])
      for (const row of group!.rows) {
        for (const code of CODES) expect(row[code]).toBe(true)
      }
      const order = comparison.map((g) => g.category)
      expect(order[order.indexOf(LABELS[lang].group) - 1]).toBe('Site')
    })
  }

  it('does not touch prices, limits or credit amounts', () => {
    expect(PLANS.map((p) => [p.code, p.monthlyPrice, p.yearlyPrice])).toEqual([
      ['free', 0, 0],
      ['starter', 399, 3990],
      ['pro', 699, 6990],
      ['ecommerce', 1999, 19990],
    ])
    expect(SITE_LIMITS).toEqual({ free: 1, starter: 1, pro: 3, ecommerce: 4 })
    expect(PAGE_LIMITS).toEqual({ free: 5, starter: 8, pro: 15, ecommerce: 15 })
    expect(AI_CREDIT_CONFIG.free.credits).toBe(50)
    expect(AI_CREDIT_CONFIG.starter.credits).toBe(150)
    expect(AI_CREDIT_CONFIG.pro.monthlyCredits).toBe(150)
  })
})
