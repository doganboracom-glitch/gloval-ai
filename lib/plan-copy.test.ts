import { describe, expect, it } from 'vitest'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'
import { websiteSchema } from './website-schema'
import {
  GLOVAL_ADS_LABEL,
  buildComparison,
  buildPlanView,
  copyLang,
  getCommonPlanCopy,
  type PlanView,
} from './plan-copy'
import {
  AI_CREDIT_CONFIG,
  CREDIT_COSTS,
  CREDIT_RULES_SUPPORT,
  PAGE_LIMITS,
  PLANS,
  SITE_PAGE_HARD_CAP,
  UPGRADE_PROMPTS,
  creditRulesWhenEmpty,
  effectivePageLimit,
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
    for (const inherited of ['SSL', 'Mobile friendly', 'Version history']) {
      expect(proLabels).not.toContain(inherited)
    }
  })

  it('page limits shown on the cards are the limits users can really reach', () => {
    for (const code of ['free', 'starter'] as const) {
      const labels = buildPlanView(code, 'yearly', 'en').groups.flatMap((g) =>
        g.items.map((i) => i.label),
      )
      expect(labels).toContain(`Up to ${effectivePageLimit(code)} pages`)
    }
    for (const code of CODES) {
      expect(effectivePageLimit(code)).toBe(Math.min(PAGE_LIMITS[code], SITE_PAGE_HARD_CAP))
    }
  })

  it('SITE_PAGE_HARD_CAP matches what the site schema really accepts', () => {
    const page = (n: number) => ({ slug: `p${n}`, title: `P${n}` })
    const pages = websiteSchema.shape.pages
    expect(pages.safeParse(Array.from({ length: SITE_PAGE_HARD_CAP }, (_, i) => page(i))).success).toBe(true)
    expect(pages.safeParse(Array.from({ length: SITE_PAGE_HARD_CAP + 1 }, (_, i) => page(i))).success).toBe(false)
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

const REMOVED_CLAIMS = [
  'Google Ads',
  'Growth',
  'Rakip analizi',
  'AI Site Analizi',
  'Gelişmiş SEO',
  'ziyaretçi analizi',
  'iyzico',
  'İletişim formu',
  'Contact form',
]

describe('pricing copy only describes features that exist', () => {
  it('cards and comparison table never mention removed or unbuilt features', () => {
    for (const lang of ['tr', 'en']) {
      const texts = [
        ...CODES.flatMap((code) =>
          buildPlanView(code, 'yearly', lang).groups.flatMap((g) =>
            g.items.flatMap((i) => [i.label, i.note ?? '']),
          ),
        ),
        ...buildComparison(lang).flatMap((g) => g.rows.map((r) => r.label)),
        ...CREDIT_COSTS.map((c) => c.action),
      ].join('\n')
      for (const claim of REMOVED_CLAIMS) expect(texts).not.toContain(claim)
    }
    expect(Object.keys(UPGRADE_PROMPTS).sort()).toEqual(
      ['advancedAi', 'analytics', 'customDomain', 'logoStudio', 'phone', 'social', 'whatsapp'].sort(),
    )
  })

  it('backup and restore claims match what each plan actually gets', () => {
    const labels = (code: (typeof CODES)[number], lang: string) =>
      buildPlanView(code, 'yearly', lang)
        .groups.flatMap((g) => g.items.map((i) => i.id))
    for (const lang of ['tr', 'en']) {
      expect(labels('free', lang)).not.toContain('autoBackup')
      expect(labels('free', lang)).not.toContain('versionHistory')
      expect(labels('starter', lang)).toContain('autoBackup')
      expect(labels('starter', lang)).not.toContain('versionHistory')
      expect(labels('pro', lang)).toContain('autoBackup')
      expect(labels('pro', lang)).toContain('versionHistory')
      expect(labels('ecommerce', lang)).toContain('autoBackup')
      expect(labels('ecommerce', lang)).toContain('versionHistory')
    }
  })

  it('credit cost table lists only real actions with the real prices', () => {
    expect(CREDIT_COSTS.map((c) => c.credits)).toEqual([1, 1, 2, 2, 2, 3, 5])
  })
})

describe('comparison table is derived from the cards', () => {
  const listed = (lang: string) =>
    buildComparison(lang)
      .filter((g) => g.category !== (lang === 'tr' ? 'Yapay zeka işlemleri' : 'AI actions'))
      .flatMap((g) => g.rows)

  it('has the same rows in TR and EN', () => {
    expect(listed('tr').length).toBe(listed('en').length)
    expect(buildComparison('tr').map((g) => g.rows.length)).toEqual(
      buildComparison('en').map((g) => g.rows.length),
    )
  })

  it('every feature on a card is ticked for that plan in the table', () => {
    const rows = buildComparison('en').flatMap((g) => g.rows)
    for (const code of CODES) {
      const view = buildPlanView(code, 'yearly', 'en')
      for (const item of view.groups.flatMap((g) => g.items)) {
        if (item.excluded) continue
        const row = rows.find((r) => r.label === (item.rowLabel ?? item.label))
        expect(row, item.label).toBeDefined()
        expect(row![code], `${code}: ${item.label}`).not.toBe(false)
      }
    }
  })

  it('plans inherit from the plan below (phone/WhatsApp reach e-commerce)', () => {
    const row = buildComparison('tr')
      .flatMap((g) => g.rows)
      .find((r) => r.label === 'Telefon ve WhatsApp butonları')!
    expect([row.free, row.starter, row.pro, row.ecommerce]).toEqual([false, true, true, true])
  })

  it('social media links: on Starter, PRO and e-commerce, never on FREE (TR and EN)', () => {
    for (const [lang, label] of [
      ['tr', 'Sosyal medya bağlantıları'],
      ['en', 'Social media links'],
    ] as const) {
      const row = buildComparison(lang)
        .flatMap((g) => g.rows)
        .find((r) => r.label === label)!
      expect(row, label).toBeDefined()
      expect([row.free, row.starter, row.pro, row.ecommerce]).toEqual([false, true, true, true])

      const onCard = (code: PlanCode) =>
        buildPlanView(code, 'yearly', lang).groups.some((g) => g.items.some((i) => i.id === 'socialLinks'))
      expect(onCard('free')).toBe(false)
      expect(onCard('starter')).toBe(true)
    }
  })

  it('limit rows show the real configured values', () => {
    const rows = buildComparison('en').flatMap((g) => g.rows)
    const pages = rows.find((r) => r.label.startsWith('Page limit'))!
    expect(pages.free).toBe(String(effectivePageLimit('free')))
    expect(pages.ecommerce).toBe(String(effectivePageLimit('pro')))
    expect(rows.find((r) => r.label === 'Sites')!.ecommerce).toBe('4')
  })
})

describe('credit box and GLOVAL ADS announcement (N1)', () => {
  const adsItems = (code: PlanCode, lang: string) =>
    buildPlanView(code, 'yearly', lang)
      .groups.flatMap((g) => g.items)
      .filter((i) => i.label === GLOVAL_ADS_LABEL)

  it('keeps the balance cap out of the visible credit notes', () => {
    for (const lang of ['tr', 'en']) {
      for (const code of ['pro', 'ecommerce'] as const) {
        const notes = buildPlanView(code, 'yearly', lang).creditNotes.join(' ')
        expect(notes).not.toContain('1.500')
        expect(notes).not.toContain('1,500')
        expect(notes).not.toMatch(/bakiye|capped/i)
      }
    }
  })

  it('moves rollover and cap into the "i" tooltip with the configured value', () => {
    const cap = AI_CREDIT_CONFIG.pro.maxBalance.toLocaleString('tr-TR')
    const tr = getCommonPlanCopy('tr').maxBalanceTip(cap)
    expect(tr).toContain(cap)
    expect(tr).toContain('devreder')
    const en = getCommonPlanCopy('en').maxBalanceTip(
      AI_CREDIT_CONFIG.pro.maxBalance.toLocaleString('en-US'),
    )
    expect(en).toContain('carry over')
    expect(en).toContain('1,500')
  })

  it('shows GLOVAL ADS with a "soon" pill on PRO and e-commerce only', () => {
    for (const lang of ['tr', 'en']) {
      const soon = lang === 'tr' ? 'Yakında' : 'Soon'
      for (const code of ['pro', 'ecommerce'] as const) {
        const items = adsItems(code, lang)
        expect(items).toHaveLength(1)
        expect(items[0].badge).toBe(soon)
        expect(items[0].excluded).toBe(true)
      }
      for (const code of ['free', 'starter'] as const) {
        expect(adsItems(code, lang)).toHaveLength(0)
      }
    }
  })

  it('lists GLOVAL ADS in the comparison table as soon, never as included', () => {
    const row = buildComparison('tr')
      .flatMap((g) => g.rows)
      .find((r) => r.label === GLOVAL_ADS_LABEL)!
    expect(row).toBeDefined()
    expect([row.free, row.starter]).toEqual([false, false])
    expect(row.pro).toBe('Yakında')
    expect(row.ecommerce).toBe('Yakında')
  })
})

describe('advanced AI row', () => {
  const idsOf = (code: PlanCode, advancedAi: boolean) =>
    buildPlanView(code, 'yearly', 'tr', { advancedAi }).groups.flatMap((g) =>
      g.items.map((i) => i.id),
    )

  it('is listed on PRO and e-commerce cards only, and only when the model differs', () => {
    for (const code of CODES) {
      const expected = code === 'pro' || code === 'ecommerce'
      expect(idsOf(code, true).includes('advancedAi')).toBe(expected)
      expect(idsOf(code, false).includes('advancedAi')).toBe(false)
    }
  })

  it('shows up in the comparison table as an AI row ticked for PRO and e-commerce', () => {
    for (const lang of ['tr', 'en']) {
      const rows = buildComparison(lang, { advancedAi: true }).flatMap((g) => g.rows)
      const labels = rows.map((r) => r.label)
      expect(labels).toContain(lang === 'tr' ? 'Gelişmiş AI işlemleri' : 'Advanced AI actions')
      const row = rows.find((r) => r.label.includes(lang === 'tr' ? 'Gelişmiş AI' : 'Advanced AI'))
      expect(row).toMatchObject({ free: false, starter: false, pro: true, ecommerce: true })
      const without = buildComparison(lang, { advancedAi: false }).flatMap((g) => g.rows)
      expect(without.map((r) => r.label)).not.toContain(row?.label)
    }
  })
})

describe('AI credit rules copy', () => {
  it('explains the empty-balance flow with real prices and the support sentence', () => {
    const text = creditRulesWhenEmpty().join(' ')
    for (const price of ['50 işlem', '100 işlem', '250 işlem']) expect(text).toContain(price)
    expect(text).toContain('Ek AI işlemi paketleri')
    const { before, linkLabel, after } = CREDIT_RULES_SUPPORT
    expect(`${before}${linkLabel}${after}`).toBe(
      "Ek modül veya özel istekleriniz için DESTEK'ten yardım alın. Talebinize göre fiyatlandırma yapılıp uygulanacaktır.",
    )
  })
})
