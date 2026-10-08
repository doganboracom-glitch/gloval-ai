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
    hasFootnote: Boolean(view.footnote),
    creditNotes: view.creditNotes.length,
    groups: view.groups.map((group) => ({
      items: group.items.map((item) => ({
        hasNote: Boolean(item.note),
        highlight: Boolean(item.highlight),
        yearlyOnly: Boolean(item.yearlyOnly),
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
      expect(emailGroup).toBeDefined()
      const [item] = emailGroup!.items
      const count = PLAN_INCLUDED_MAILBOXES[code]
      if (count === 0) {
        expect(item.excluded).toBe(true)
      } else {
        expect(item.excluded).toBeFalsy()
        expect(item.label).toContain(String(count))
      }
    }
  })

  it('hides nothing but yearly-only rows, and only the domain gift is yearly-only', () => {
    for (const code of CODES) {
      const yearlyOnly = buildPlanView(code, 'yearly', 'en')
        .groups.flatMap((group) => group.items)
        .filter((item) => item.yearlyOnly)
      expect(yearlyOnly.length).toBe(code === 'free' ? 0 : 1)
    }
  })

  it('PRO credits are identical for monthly and yearly billing', () => {
    for (const lang of ['tr', 'en']) {
      const monthly = buildPlanView('pro', 'monthly', lang)
      const yearly = buildPlanView('pro', 'yearly', lang)
      expect(monthly.creditSummary).toBe(yearly.creditSummary)
      expect(monthly.creditNotes).toEqual(yearly.creditNotes)
      expect(monthly.creditNotes[0]).toContain(`+${AI_CREDIT_CONFIG.pro.monthlyCredits}`)
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
