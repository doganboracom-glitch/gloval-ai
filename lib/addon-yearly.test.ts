import { describe, expect, it } from 'vitest'
import {
  ADD_ONS,
  ADD_ON_YEARLY_PRICE_FACTOR,
  YEARLY_ADD_ON_CODES,
  addMonthsUtc,
  addOnBillingPeriod,
  grantEffectiveEnd,
  isAddOnPurchasableCode,
  resolveAddOnExpiry,
  resolveAddOnPrices,
  resolveEffectiveProductLimit,
  resolveEffectiveSiteLimits,
  type AddOnCode,
  type AddOnGrant,
} from '@/lib/add-ons'
import { mailAddonGrantsFromRows, type MailAddonEntitlementRow } from '@/lib/mail/addon-grants'
import { PRODUCT_LIMITS } from '@/lib/pricing-config'

const NOW = new Date('2026-10-10T12:00:00.000Z')
const d = (iso: string) => new Date(iso)

describe('addMonthsUtc', () => {
  it('clamps 31 January to the end of February (common and leap year)', () => {
    expect(addMonthsUtc(d('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z')
    expect(addMonthsUtc(d('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z')
  })

  it('clamps 29 February to 28 February a year later and keeps it in a leap year', () => {
    expect(addMonthsUtc(d('2028-02-29T00:00:00Z'), 12).toISOString()).toBe('2029-02-28T00:00:00.000Z')
    expect(addMonthsUtc(d('2028-02-29T00:00:00Z'), 48).toISOString()).toBe('2032-02-29T00:00:00.000Z')
  })

  it('clamps into 30-day months', () => {
    expect(addMonthsUtc(d('2026-03-31T00:00:00Z'), 1).toISOString()).toBe('2026-04-30T00:00:00.000Z')
    expect(addMonthsUtc(d('2026-10-31T00:00:00Z'), 1).toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(addMonthsUtc(d('2026-04-30T00:00:00Z'), 12).toISOString()).toBe('2027-04-30T00:00:00.000Z')
  })

  it('rolls over the year end', () => {
    expect(addMonthsUtc(d('2026-12-31T23:59:59Z'), 12).toISOString()).toBe('2027-12-31T23:59:59.000Z')
    expect(addMonthsUtc(d('2026-12-15T00:00:00Z'), 2).toISOString()).toBe('2027-02-15T00:00:00.000Z')
  })

  it('does not mutate its input', () => {
    const from = d('2026-01-31T00:00:00Z')
    addMonthsUtc(from, 1)
    expect(from.toISOString()).toBe('2026-01-31T00:00:00.000Z')
  })
})

describe('resolveAddOnExpiry', () => {
  const periodEnd = '2026-11-01T00:00:00.000Z'

  it('yearly: purchase + 12 months, regardless of the subscription period end', () => {
    expect(resolveAddOnExpiry('extra_mail_1_yearly', periodEnd, d('2026-03-15T09:30:00Z'))).toBe(
      '2027-03-15T09:30:00.000Z',
    )
    expect(resolveAddOnExpiry('extra_product_50_yearly', periodEnd, d('2028-02-29T00:00:00Z'))).toBe(
      '2029-02-28T00:00:00.000Z',
    )
  })

  it('monthly: the subscription period end', () => {
    expect(resolveAddOnExpiry('extra_mail_1', periodEnd, d('2026-03-15T09:30:00Z'))).toBe(periodEnd)
  })

  it.each([...YEARLY_ADD_ON_CODES])('every yearly SKU (%s) expires exactly 12 months after purchase', (code) => {
    expect(resolveAddOnExpiry(code, periodEnd, d('2026-05-20T00:00:00Z'))).toBe('2027-05-20T00:00:00.000Z')
  })
})

describe('yearly catalog pricing', () => {
  const yearly = Object.values(ADD_ONS).filter((def) => def.period === 'year')

  it('has six yearly SKUs', () => {
    expect(yearly.map((def) => def.code).sort()).toEqual(
      [
        'extra_corporate_site_1_yearly',
        'extra_ecommerce_product_100_yearly',
        'extra_ecommerce_site_1_yearly',
        'extra_mail_1_yearly',
        'extra_mail_5_yearly',
        'extra_product_50_yearly',
      ].sort(),
    )
  })

  it.each(yearly.map((def) => [def.code, def] as const))('%s costs 10x its monthly SKU', (_code, def) => {
    const monthly = ADD_ONS[def.monthlyCode as AddOnCode]
    expect(monthly.period).toBeUndefined()
    expect(def.listPriceCents).toBe(monthly.listPriceCents * ADD_ON_YEARLY_PRICE_FACTOR)
    expect(def.capacity).toBe(monthly.capacity)
    expect(def.kind).toBe(monthly.kind)
    expect(def.siteTarget).toBe(monthly.siteTarget)
    expect(def.validity).toBe('twelve_months')
  })

  it('matches the agreed kurus amounts (and their TL equivalents)', () => {
    const expected: Record<string, number> = {
      extra_corporate_site_1_yearly: 199000,
      extra_ecommerce_site_1_yearly: 499000,
      extra_mail_1_yearly: 49000,
      extra_mail_5_yearly: 199000,
      extra_product_50_yearly: 199000,
      extra_ecommerce_product_100_yearly: 349000,
      extra_product_50: 19900,
      extra_ecommerce_product_100: 34900,
    }
    for (const [code, cents] of Object.entries(expected)) {
      expect(ADD_ONS[code as AddOnCode].listPriceCents).toBe(cents)
    }
    expect(ADD_ONS.extra_corporate_site_1_yearly.listPriceCents / 100).toBe(1990)
    expect(ADD_ONS.extra_ecommerce_product_100.listPriceCents / 100).toBe(349)
  })

  it('a yearly price is only read from a year-interval row; a month row never prices a yearly SKU', () => {
    const prices = resolveAddOnPrices([
      { code: 'extra_mail_1_yearly', price_cents: 1, currency: 'TRY', interval: 'month', product_category: 'addon', active: true },
      { code: 'extra_mail_5_yearly', price_cents: 123000, currency: 'try', interval: 'year', product_category: 'addon', active: true },
    ])
    expect(prices.extra_mail_1_yearly).toEqual({ priceCents: 49000, currency: 'TRY', source: 'catalog' })
    expect(prices.extra_mail_5_yearly).toEqual({ priceCents: 123000, currency: 'TRY', source: 'db' })
  })

  it('reports the billing period per code', () => {
    expect(addOnBillingPeriod('extra_mail_1_yearly')).toBe('year')
    expect(addOnBillingPeriod('extra_mail_1')).toBe('month')
    expect(addOnBillingPeriod('constructor')).toBe('month')
  })
})

describe('sale gating', () => {
  it('every yearly SKU is purchasable, every discontinued SKU is not', () => {
    for (const code of YEARLY_ADD_ON_CODES) expect(isAddOnPurchasableCode(code)).toBe(true)
    for (const code of ['extra_site_1', 'extra_product_100', 'extra_product_200', 'extra_product_500', 'extra_mail_10'])
      expect(isAddOnPurchasableCode(code)).toBe(false)
    expect(isAddOnPurchasableCode('extra_mail_1_yearly_typo')).toBe(false)
  })
})

describe('grantEffectiveEnd', () => {
  const grant = (addonCode: string, extra: Partial<AddOnGrant>): AddOnGrant => ({
    addonCode,
    status: 'active',
    startsAt: null,
    expiresAt: null,
    subscriptionId: 's1',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: null,
    ...extra,
  })

  it('yearly: capped by an earlier main-plan end', () => {
    expect(
      grantEffectiveEnd(
        grant('extra_mail_1_yearly', { expiresAt: '2027-06-01T00:00:00Z', subscriptionPeriodEnd: '2026-12-01T00:00:00Z' }),
      ),
    ).toBe('2026-12-01T00:00:00Z')
  })

  it('yearly: keeps the full 12 months when the main plan ends later', () => {
    expect(
      grantEffectiveEnd(
        grant('extra_mail_1_yearly', { expiresAt: '2027-06-01T00:00:00Z', subscriptionPeriodEnd: '2028-01-01T00:00:00Z' }),
      ),
    ).toBe('2027-06-01T00:00:00Z')
  })

  it('yearly: without an own end date there is no capacity window', () => {
    expect(grantEffectiveEnd(grant('extra_mail_1_yearly', { subscriptionPeriodEnd: '2028-01-01T00:00:00Z' }))).toBeNull()
  })

  it('monthly: still follows the subscription period', () => {
    expect(
      grantEffectiveEnd(
        grant('extra_mail_1', { expiresAt: '2026-01-01T00:00:00Z', subscriptionPeriodEnd: '2026-12-01T00:00:00Z' }),
      ),
    ).toBe('2026-12-01T00:00:00Z')
  })
})

describe('yearly grants and capacity', () => {
  const yearlyGrant = (addonCode: string, extra: Partial<AddOnGrant> = {}): AddOnGrant => ({
    addonCode,
    status: 'active',
    startsAt: null,
    expiresAt: '2027-06-01T00:00:00Z',
    subscriptionId: 's1',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: '2028-01-01T00:00:00Z',
    ...extra,
  })

  it('+50 product (PRO) and +100 product (e-commerce) raise the product limit, monthly and yearly alike', () => {
    expect(resolveEffectiveProductLimit({ planCode: 'pro', grants: [], now: NOW })).toBe(PRODUCT_LIMITS.pro)
    for (const code of ['extra_product_50', 'extra_product_50_yearly']) {
      expect(resolveEffectiveProductLimit({ planCode: 'pro', grants: [yearlyGrant(code)], now: NOW })).toBe(
        (PRODUCT_LIMITS.pro as number) + 50,
      )
    }
    for (const code of ['extra_ecommerce_product_100', 'extra_ecommerce_product_100_yearly']) {
      expect(resolveEffectiveProductLimit({ planCode: 'ecommerce', grants: [yearlyGrant(code)], now: NOW })).toBe(
        (PRODUCT_LIMITS.ecommerce as number) + 100,
      )
    }
  })

  it('a yearly grant adds nothing once its 12 months are over', () => {
    const limit = resolveEffectiveProductLimit({
      planCode: 'pro',
      grants: [yearlyGrant('extra_product_50_yearly', { expiresAt: '2026-10-09T00:00:00Z' })],
      now: NOW,
    })
    expect(limit).toBe(PRODUCT_LIMITS.pro)
  })

  it('keeps corporate and e-commerce site allowances separate', () => {
    const base = resolveEffectiveSiteLimits({ planCode: 'ecommerce', grants: [], now: NOW })
    const corporate = resolveEffectiveSiteLimits({
      planCode: 'ecommerce',
      grants: [yearlyGrant('extra_corporate_site_1_yearly')],
      now: NOW,
    })
    expect(corporate.total).toBe(base.total + 1)
    expect(corporate.ecommerce).toBe(base.ecommerce)
    expect(corporate.corporate).toBe(base.corporate + 1)

    const shop = resolveEffectiveSiteLimits({
      planCode: 'ecommerce',
      grants: [yearlyGrant('extra_ecommerce_site_1_yearly')],
      now: NOW,
    })
    expect(shop.total).toBe(base.total + 1)
    expect(shop.ecommerce).toBe(base.ecommerce + 1)
    expect(shop.corporate).toBe(base.corporate)
  })
})

describe('mailAddonGrantsFromRows (yearly)', () => {
  const iso = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()
  const row = (
    code: string,
    expiresAt: string | null,
    sub: { status: string; current_period_end: string | null } = { status: 'active', current_period_end: iso(20) },
  ): MailAddonEntitlementRow => ({
    addon_code: code,
    status: 'active',
    starts_at: iso(-10),
    expires_at: expiresAt,
    subscription_id: 'sub-1',
    billing_subscriptions: { grace_period_ends_at: null, updated_at: null, ...sub },
  })

  it('is entitled for its own 12 months even past the current monthly period', () => {
    const [g] = mailAddonGrantsFromRows([row('extra_mail_5_yearly', iso(300), { status: 'active', current_period_end: iso(300) })], NOW)
    expect(g).toMatchObject({ capacity: 5, entitled: true })
    expect(g.endsAt).toBe(iso(300))
  })

  it('stops at the main subscription end when that is earlier', () => {
    const [g] = mailAddonGrantsFromRows([row('extra_mail_1_yearly', iso(300))], NOW)
    expect(g.entitled).toBe(true)
    expect(g.endsAt).toBe(iso(20))
  })

  it('is not entitled after its own end date', () => {
    const [g] = mailAddonGrantsFromRows([row('extra_mail_1_yearly', iso(-1))], NOW)
    expect(g.entitled).toBe(false)
    expect(g.endedAt).toBe(iso(-1))
  })

  it('is not entitled when the main subscription is canceled', () => {
    const [g] = mailAddonGrantsFromRows(
      [row('extra_mail_1_yearly', iso(300), { status: 'canceled', current_period_end: iso(-2) })],
      NOW,
    )
    expect(g.entitled).toBe(false)
  })

  it('a row without an expires_at grants nothing', () => {
    const [g] = mailAddonGrantsFromRows([row('extra_mail_1_yearly', null)], NOW)
    expect(g.entitled).toBe(false)
  })

  it('monthly mail still follows the subscription state', () => {
    const [g] = mailAddonGrantsFromRows([row('extra_mail_1', iso(20))], NOW)
    expect(g).toMatchObject({ capacity: 1, entitled: true })
    expect(g.endsAt).toBe(iso(20))
  })
})
