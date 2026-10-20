import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PlanCard } from '@/components/pricing/plan-card'
import {
  PINNED_ITEM_IDS,
  PLAN_VISIBLE_ITEM_COUNT,
  buildPlanView,
  splitPlanItems,
} from './plan-copy'
import { PLANS, type PlanCode } from './pricing-config'

const CODES: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']
const LANGS = ['tr', 'en'] as const
const BUTTON_TEXT = {
  tr: { closed: 'Tüm özellikleri göster', open: 'Daha az göster' },
  en: { closed: 'Show all features', open: 'Show less' },
} as const

function render(code: PlanCode, lang: 'tr' | 'en', expanded: boolean) {
  const plan = PLANS.find((p) => p.code === code)!
  return renderToStaticMarkup(
    createElement(LanguageProvider, {
      initialLang: lang,
      children: createElement(PlanCard, {
        plan,
        cycle: 'yearly',
        expanded,
        onExpandedChange: () => {},
      }),
    }),
  )
}

const countItems = (html: string) => (html.match(/<li class="flex items-start/g) ?? []).length

/** Splits the markup at the collapsible region: [visible part, collapsible part]. */
function parts(html: string, code: PlanCode) {
  const match = html.match(/<div id="([^"]*-features)"([^>]*)>/)
  expect(match, `${code}: collapsible region`).not.toBeNull()
  const at = match!.index!
  const end = html.indexOf('<button type="button" aria-expanded')
  return {
    id: match![1],
    attrs: match![2],
    before: html.slice(0, at),
    region: html.slice(at, end === -1 ? undefined : end),
  }
}

describe('collapsed card shows exactly six rows (pins)', () => {
  for (const lang of LANGS) {
    for (const code of CODES) {
      it(`${code} / ${lang}: 6 featured, the rest behind the toggle, nothing lost`, () => {
        const view = buildPlanView(code, 'yearly', lang)
        const all = view.groups.flatMap((g) => g.items)
        const { featured, restGroups, hiddenCount } = splitPlanItems(view)
        const rest = restGroups.flatMap((g) => g.items)

        expect(PLAN_VISIBLE_ITEM_COUNT).toBe(6)
        expect(featured).toHaveLength(6)
        expect(hiddenCount).toBe(all.length - 6)
        expect([...featured, ...rest].map((i) => i.id).sort()).toEqual(
          all.map((i) => i.id).sort(),
        )
      })
    }
  }

  it('featured rows follow the explicit pin order of each plan', () => {
    for (const code of CODES) {
      const view = buildPlanView(code, 'yearly', 'en')
      const { featured } = splitPlanItems(view)
      const ids = featured.map((i) => i.id)
      const expected = PINNED_ITEM_IDS[code].filter((id) =>
        view.groups.some((g) => g.items.some((i) => i.id === id)),
      )
      expect(ids).toEqual(expected.slice(0, 6))
      for (const item of featured) expect(item.pin).toBeDefined()
    }
  })

  it('the six visible rows per plan are the intended ones', () => {
    const visible = (code: PlanCode) =>
      splitPlanItems(buildPlanView(code, 'yearly', 'en')).featured.map((i) => i.id)
    expect(visible('free')).toEqual(['sites', 'pages', 'blog', 'glovalAddress', 'ssl', 'seo'])
    expect(visible('starter')).toEqual([
      'pages',
      'customDomain',
      'blog',
      'autoBackup',
      'mailboxes',
      'support',
    ])
    expect(visible('pro')).toEqual([
      'sites',
      'catalogOrder',
      'autoBackup',
      'versionHistory',
      'advancedAi',
      'support',
    ])
    expect(visible('ecommerce')).toEqual([
      'sites',
      'products',
      'storePages',
      'cartOrders',
      'paymentMethods',
      'mailboxes',
    ])
  })
})

describe('plan card toggle markup', () => {
  for (const lang of LANGS) {
    for (const code of CODES) {
      it(`${code} / ${lang}: closed shows 6 rows, open shows all, rest stays in the DOM`, () => {
        const total = buildPlanView(code, 'yearly', lang).groups.flatMap((g) => g.items).length
        const hidden = total - 6

        const closed = render(code, lang, false)
        const open = render(code, lang, true)

        const c = parts(closed, code)
        expect(countItems(c.before)).toBe(6)
        // Collapsed rows are still rendered (not deleted), only inert/visually closed.
        expect(countItems(c.region)).toBe(hidden)
        expect(c.attrs).toContain('inert')
        expect(c.region).toContain('grid-rows-[0fr]')
        expect(countItems(closed)).toBe(total)

        const o = parts(open, code)
        expect(countItems(o.before) + countItems(o.region)).toBe(total)
        expect(o.attrs).not.toContain('inert')
        expect(o.region).toContain('grid-rows-[1fr]')
      })

      it(`${code} / ${lang}: button has aria-expanded, aria-controls and the right text`, () => {
        const closed = render(code, lang, false)
        const open = render(code, lang, true)
        const id = parts(closed, code).id

        expect(closed).toContain('aria-expanded="false"')
        expect(closed).toContain(`aria-controls="${id}"`)
        expect(closed).toContain(BUTTON_TEXT[lang].closed)
        expect(closed).not.toContain(BUTTON_TEXT[lang].open)

        expect(open).toContain('aria-expanded="true"')
        expect(open).toContain(`aria-controls="${parts(open, code).id}"`)
        expect(open).toContain(BUTTON_TEXT[lang].open)
        expect(open).not.toContain(BUTTON_TEXT[lang].closed)
      })
    }
  }

  it('card ids stay unique across the four plans', () => {
    const ids = CODES.map((code) => parts(render(code, 'en', false), code).id)
    expect(new Set(ids).size).toBe(4)
  })
})

describe('e-commerce "in addition to PRO" list', () => {
  // Everything STARTER and PRO already list in identical form.
  const INHERITED = [
    'glovalAddress',
    'ssl',
    'mobile',
    'seo',
    'contact',
    'customDomain',
    'autoBackup',
    'trackingCodes',
    'phoneWhatsapp',
    'socialLinks',
    'logoStudio',
    'versionHistory',
    'advancedAi',
    'glovalAds',
    'support',
    'pages',
    'catalogOrder',
  ]

  for (const lang of LANGS) {
    it(`${lang}: has no key inherited from PRO, but keeps the changed values`, () => {
      const view = buildPlanView('ecommerce', 'yearly', lang)
      const items = view.groups.flatMap((g) => g.items)
      const ids = items.map((i) => i.id)
      for (const id of INHERITED) expect(ids, id).not.toContain(id)

      const valueOf = (id: string) => items.find((i) => i.id === id)?.value
      expect(valueOf('sites')).toBe('4')
      expect(valueOf('products')).toBe('150')
      expect(valueOf('mailboxes')).toBe('5')
    })

    it(`${lang}: the rendered card says it extends PRO and does not repeat inherited labels`, () => {
      const html = render('ecommerce', lang, true)
      expect(html).toContain(lang === 'tr' ? 'EK OLARAK' : 'IN ADDITION TO THE PRO PLAN')
      const pro = buildPlanView('pro', 'yearly', lang)
      for (const item of pro.groups.flatMap((g) => g.items)) {
        if (['sites', 'mailboxes'].includes(item.id)) continue
        expect(html, item.label).not.toContain(`>${item.label}<`)
      }
    })
  }
})
