import { describe, expect, it } from 'vitest'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'
import {
  buildPlanView,
  copyLang,
  getCommonPlanCopy,
  type PlanView,
} from './plan-copy'
import {
  AI_CREDIT_CONFIG,
  PAGE_LIMITS,
  PLANS,
  type BillingCycle,
  type PlanCode,
} from './pricing-config'

const CODES: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']
const CYCLES: BillingCycle[] = ['monthly', 'yearly']

/** Structure of a view with every translatable string removed. */
function shape(view: PlanView) {
  return {
    code: view.code,
    hasBadge: Boolean(view.badge),
    hasExtendsLabel: Boolean(view.extendsLabel),
    creditNotes: view.creditNotes.length,
    groups: view.groups.map((group) => ({
      items: group.items.map((item) => ({
        hasNote: Boolean(item.note),
        highlight: Boolean(item.highlight),
        excluded: Boolean(item.excluded),
      })),
    })),
  }
}

describe('plan copy TR/EN parity', () => {
  for (const code of CODES) {
    for (const cycle of CYCLES) {
      it(`${code} / ${cycle} has the same groups and items in TR and EN`, () => {
        expect(shape(buildPlanView(code, cycle, 'tr'))).toEqual(
          shape(buildPlanView(code, cycle, 'en')),
        )
      })
    }
  }

  it('has non-empty text for every string in both languages', () => {
    for (const lang of ['tr', 'en']) {
      for (const code of CODES) {
        const view = buildPlanView(code, 'yearly', lang)
        const texts = [
          view.name,
          view.headline,
          view.description,
          view.cta,
          view.creditSummary,
          ...view.creditNotes,
          ...view.groups.flatMap((group) => [
            group.title,
            ...group.items.flatMap((item) => [item.label, item.note ?? 'ok']),
          ]),
        ]
        for (const text of texts) expect(text.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to English for every language except Turkish', () => {
    expect(copyLang('tr')).toBe('tr')
    for (const lang of ['en', 'de', 'ar', 'ru', '', null, undefined]) {
      expect(copyLang(lang)).toBe('en')
    }
    expect(buildPlanView('pro', 'yearly', 'de')).toEqual(
      buildPlanView('pro', 'yearly', 'en'),
    )
    expect(getCommonPlanCopy('fr')).toBe(getCommonPlanCopy('en'))
  })

  it('has common copy keys in both languages', () => {
    const tr = getCommonPlanCopy('tr')
    const en = getCommonPlanCopy('en')
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort())
    expect(tr.yearlyHighlight).toContain('10 ay öde, 12 ay kullan')
  })
})

describe('plan copy follows the configuration', () => {
  it('lists the same plans, in the same order, as PLANS', () => {
    expect(PLANS.map((plan) => plan.code)).toEqual(CODES)
  })

  it('shows the real included mailbox count for each plan', () => {
    for (const code of CODES) {
      const emailGroup = buildPlanView(code, 'monthly', 'tr').groups.find(
        (group) => group.title === 'E-posta',
      )
      const count = PLAN_INCLUDED_MAILBOXES[code]
      if (count === 0) {
        expect(emailGroup).toBeUndefined()
      } else {
        expect(emailGroup).toBeDefined()
        expect(emailGroup!.items[0].label).toContain(String(count))
      }
    }
  })

  it('lists the .com.tr gift only under the price, never as a feature row', () => {
    for (const code of CODES) {
      for (const lang of ['tr', 'en']) {
        const labels = buildPlanView(code, 'yearly', lang)
          .groups.flatMap((group) => group.items)
          .map((item) => item.label)
        expect(labels.some((label) => label.includes('.com.tr'))).toBe(false)
      }
    }
  })

  it('PRO and e-commerce only list what they add on top of the plan below', () => {
    expect(buildPlanView('free', 'yearly', 'en').extendsLabel).toBeUndefined()
    expect(buildPlanView('starter', 'yearly', 'en').extendsLabel).toBeUndefined()
    expect(buildPlanView('pro', 'yearly', 'en').extendsLabel).toContain('STARTER')
    expect(buildPlanView('ecommerce', 'yearly', 'en').extendsLabel).toContain('PRO')

    const proLabels = buildPlanView('pro', 'yearly', 'en').groups.flatMap((g) =>
      g.items.map((i) => i.label),
    )
    for (const inherited of ['SSL', 'Mobile friendly', 'Google Analytics']) {
      expect(proLabels).not.toContain(inherited)
    }
  })

  it('page limits shown on the cards come from PAGE_LIMITS', () => {
    for (const code of ['free', 'starter', 'pro'] as const) {
      const labels = buildPlanView(code, 'yearly', 'en').groups.flatMap((g) =>
        g.items.map((i) => i.label),
      )
      expect(labels).toContain(`Up to ${PAGE_LIMITS[code]} pages`)
    }
  })

  it('PRO credits are identical for monthly and yearly billing', () => {
    for (const lang of ['tr', 'en']) {
      const monthly = buildPlanView('pro', 'monthly', lang)
      const yearly = buildPlanView('pro', 'yearly', lang)
      expect(monthly.creditSummary).toBe(yearly.creditSummary)
      expect(monthly.creditNotes).toEqual(yearly.creditNotes)
      expect(monthly.creditNotes[0]).toContain(String(AI_CREDIT_CONFIG.pro.monthlyCredits))
    }
  })

  it('PRO and e-commerce share the same rollover rule and balance cap', () => {
    expect(AI_CREDIT_CONFIG.ecommerce.rollover).toBe(AI_CREDIT_CONFIG.pro.rollover)
    expect(AI_CREDIT_CONFIG.ecommerce.maxBalance).toBe(AI_CREDIT_CONFIG.pro.maxBalance)
    expect(AI_CREDIT_CONFIG.ecommerce.monthlyCredits).toBe(AI_CREDIT_CONFIG.pro.monthlyCredits)
  })

  it('e-commerce credits come from the config, not from literals', () => {
    const view = buildPlanView('ecommerce', 'monthly', 'en')
    expect(view.creditSummary).toContain(
      String(AI_CREDIT_CONFIG.ecommerce.initialCredits),
    )
    expect(view.creditNotes[0]).toContain(
      String(AI_CREDIT_CONFIG.ecommerce.monthlyCredits),
    )
  })
})
