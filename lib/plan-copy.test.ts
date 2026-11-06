import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/lib/locale-registry'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'
import { websiteSchema } from './website-schema'
import {
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
    const de = buildPlanView('pro', 'yearly', 'de')
    const en = buildPlanView('pro', 'yearly', 'en')
    expect(de.headline).toBe(en.headline)
    expect(de.creditSummary).not.toBe(en.creditSummary)
    expect(de.creditNotes).not.toEqual(en.creditNotes)
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

  it('credit allowances are identical for monthly and yearly billing', () => {
    for (const lang of SUPPORTED_LOCALES) {
      for (const code of ['starter', 'pro', 'ecommerce'] as const) {
        const monthly = buildPlanView(code, 'monthly', lang)
        const yearly = buildPlanView(code, 'yearly', lang)
        expect(monthly.creditSummary).toBe(yearly.creditSummary)
        expect(monthly.creditNotes).toEqual(yearly.creditNotes)
      }
    }
  })

  it('PRO and e-commerce share rollover and the same 1,000-credit balance cap', () => {
    expect(AI_CREDIT_CONFIG.ecommerce.rollover).toBe(AI_CREDIT_CONFIG.pro.rollover)
    expect(AI_CREDIT_CONFIG.pro.maxBalance).toBe(1000)
    expect(AI_CREDIT_CONFIG.ecommerce.maxBalance).toBe(1000)
    expect(AI_CREDIT_CONFIG.ecommerce.monthlyCredits).toBe(100)
    expect(AI_CREDIT_CONFIG.pro.monthlyCredits).toBe(50)
  })

  it('e-commerce credits come from the config, not from literals', () => {
    const view = buildPlanView('ecommerce', 'monthly', 'en')
    const number = new Intl.NumberFormat('en')
    expect(view.creditSummary).toContain(
      number.format(AI_CREDIT_CONFIG.ecommerce.initialCredits),
    )
    expect(view.creditNotes[0]).toContain(
      number.format(AI_CREDIT_CONFIG.ecommerce.monthlyCredits),
    )
  })

  it('localizes plan credit allowances and caps for all 12 supported languages', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(12)

    for (const lang of SUPPORTED_LOCALES) {
      const number = new Intl.NumberFormat(lang)
      const free = buildPlanView('free', 'monthly', lang)
      const starter = buildPlanView('starter', 'yearly', lang)
      const pro = buildPlanView('pro', 'yearly', lang)
      const ecommerce = buildPlanView('ecommerce', 'monthly', lang)

      expect(free.creditSummary).toContain(number.format(AI_CREDIT_CONFIG.free.credits))
      expect(starter.creditSummary).toContain(number.format(AI_CREDIT_CONFIG.starter.credits))
      expect(pro.creditSummary).toContain(number.format(AI_CREDIT_CONFIG.pro.initialCredits))
      expect(pro.creditNotes[0]).toContain(number.format(AI_CREDIT_CONFIG.pro.monthlyCredits))
      expect(pro.creditNotes[2]).toContain(number.format(AI_CREDIT_CONFIG.pro.maxBalance))
      expect(ecommerce.creditSummary).toContain(number.format(AI_CREDIT_CONFIG.ecommerce.initialCredits))
      expect(ecommerce.creditNotes[0]).toContain(number.format(AI_CREDIT_CONFIG.ecommerce.monthlyCredits))
      expect(ecommerce.creditNotes[2]).toContain(number.format(AI_CREDIT_CONFIG.ecommerce.maxBalance))
    }
  })
})

const REMOVED_CLAIMS = [
  'Google Ads',
  'Growth',
  'Rakip analizi',
  'AI Site Analizi',
  'Gelişmiş SEO',
  'ziyaretçi analizi',
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
      // The e-commerce card only lists what it adds on top of PRO, so it
      // inherits both rows instead of repeating them.
      expect(labels('ecommerce', lang)).not.toContain('autoBackup')
      expect(labels('ecommerce', lang)).not.toContain('versionHistory')
      expect(buildPlanView('ecommerce', 'yearly', lang).extendsLabel).toContain('PRO')
    }
  })

  it('credit cost table lists only real actions with the real prices', () => {
    expect(CREDIT_COSTS.map((c) => c.credits)).toEqual([1, 1, 2, 2, 2, 3, 5])
  })
})

describe('comparison table is derived from the cards', () => {
  const cardPaymentCopy: Record<SupportedLocale, { label: string; note: string }> = {
    tr: { label: 'Kart ile ödeme', note: '(diğer firmalar opsiyonel olarak eklenebilir.)' },
    en: { label: 'Card payments', note: '(other providers can optionally be added.)' },
    fr: {
      label: 'Paiement par carte',
      note: '(D’autres prestataires peuvent être ajoutés en option.)',
    },
    de: {
      label: 'Kartenzahlung',
      note: '(Weitere Anbieter können optional hinzugefügt werden.)',
    },
    it: {
      label: 'Pagamenti con carta',
      note: '(Altri fornitori possono essere aggiunti facoltativamente.)',
    },
    et: {
      label: 'Kaardimaksed',
      note: '(Teisi teenusepakkujaid saab soovi korral lisada.)',
    },
    pl: { label: 'Płatność kartą', note: '(Innych dostawców można opcjonalnie dodać.)' },
    es: {
      label: 'Pago con tarjeta',
      note: '(Se pueden añadir otros proveedores de forma opcional.)',
    },
    pt: {
      label: 'Pagamento com cartão',
      note: '(Outros fornecedores podem ser adicionados opcionalmente.)',
    },
    ar: { label: 'الدفع بالبطاقة', note: '(يمكن إضافة مزوّدين آخرين اختياريًا.)' },
    ru: {
      label: 'Оплата картой',
      note: '(Других поставщиков можно добавить по желанию.)',
    },
    az: {
      label: 'Kartla ödəniş',
      note: '(Digər provayderlər istəyə bağlı əlavə edilə bilər.)',
    },
  }

  const listed = (lang: string) =>
    buildComparison(lang)
      .filter((g) => g.category !== (lang === 'tr' ? 'Yapay zekâ kredileri' : 'AI credits'))
      .flatMap((g) => g.rows)

  it('has the same rows in TR and EN', () => {
    expect(listed('tr').length).toBe(listed('en').length)
    expect(buildComparison('tr').map((g) => g.rows.length)).toEqual(
      buildComparison('en').map((g) => g.rows.length),
    )
  })

  it('localizes card payments and keeps the provider note in the e-commerce value cell', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const expected = cardPaymentCopy[lang]
      const row = buildComparison(lang)
        .flatMap((group) => group.rows)
        .find((candidate) => candidate.label === expected.label)

      expect(row, lang).toBeDefined()
      expect(row?.label).toBe(expected.label)
      expect([row?.free, row?.starter, row?.pro]).toEqual([false, false, false])
      expect(row?.ecommerce).toEqual({ text: 'iyzico', note: expected.note })
    }
  })

  it('shows localized card payments as included on the e-commerce card', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const expected = cardPaymentCopy[lang]
      const paymentItem = buildPlanView('ecommerce', 'yearly', lang)
        .groups.flatMap((group) => group.items)
        .find((item) => item.id === 'cardPayment')

      expect(paymentItem, lang).toBeDefined()
      expect(paymentItem?.label).toBe(expected.label)
      expect(paymentItem?.note).toBe(`iyzico ${expected.note}`)
      expect(paymentItem?.excluded).toBeUndefined()
      expect(paymentItem?.soon).toBeUndefined()

      for (const code of CODES.filter((planCode) => planCode !== 'ecommerce')) {
        const otherPlanText = buildPlanView(code, 'yearly', lang).groups
          .flatMap((group) => group.items)
          .flatMap((item) => [item.label, item.note ?? ''])
          .join('\n')
        expect(otherPlanText).not.toContain('iyzico')
      }
    }
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

describe('credit box content', () => {
  it('shows each paid plan period allowance and the maximum balance on the cards', () => {
    for (const lang of SUPPORTED_LOCALES) {
      const number = new Intl.NumberFormat(lang)
      for (const [code, monthlyCredits, initialCredits] of [
        ['pro', AI_CREDIT_CONFIG.pro.monthlyCredits, AI_CREDIT_CONFIG.pro.initialCredits],
        ['ecommerce', AI_CREDIT_CONFIG.ecommerce.monthlyCredits, AI_CREDIT_CONFIG.ecommerce.initialCredits],
      ] as const) {
        const view = buildPlanView(code, 'yearly', lang)
        expect(view.creditSummary).toContain(number.format(initialCredits))
        expect(view.creditNotes[0]).toContain(number.format(monthlyCredits))
        expect(view.creditNotes[2]).toContain(number.format(1000))
      }
    }
  })

  it('keeps the configured rollover and cap in the info tooltip', () => {
    const cap = AI_CREDIT_CONFIG.pro.maxBalance.toLocaleString('tr-TR')
    const tr = getCommonPlanCopy('tr').maxBalanceTip(cap)
    expect(tr).toContain(cap)
    expect(tr).toContain('devreder')
    const en = getCommonPlanCopy('en').maxBalanceTip(
      AI_CREDIT_CONFIG.pro.maxBalance.toLocaleString('en-US'),
    )
    expect(en).toContain('carry over')
    expect(en).toContain('1,000')
  })
})

describe('retired GLOVAL ADS plan row', () => {
  it('is absent from every localized plan and comparison view', () => {
    for (const lang of ['tr', 'en']) {
      for (const code of CODES) {
        const labels = buildPlanView(code, 'yearly', lang)
          .groups.flatMap((group) => group.items.map((item) => item.label))
        expect(labels).not.toContain('GLOVAL ADS')
      }

      const comparisonLabels = buildComparison(lang).flatMap((group) =>
        group.rows.map((row) => row.label),
      )
      expect(comparisonLabels).not.toContain('GLOVAL ADS')
    }
  })
})

describe('advanced AI row', () => {
  const idsOf = (code: PlanCode, advancedAi: boolean) =>
    buildPlanView(code, 'yearly', 'tr', { advancedAi }).groups.flatMap((g) =>
      g.items.map((i) => i.id),
    )

  it('is listed on the PRO card (inherited by e-commerce), and only when the model differs', () => {
    for (const code of CODES) {
      const expected = code === 'pro'
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
