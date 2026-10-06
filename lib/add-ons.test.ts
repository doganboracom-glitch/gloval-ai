import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  override: null as number | null,
  upserts: [] as Array<Record<string, unknown>>,
  failRead: false,
  sub: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'billing_subscriptions'
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: state.sub, error: null }),
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                eq: async () =>
                  state.failRead
                    ? { data: null, error: { message: 'boom' } }
                    : { data: state.rows, error: null },
              }),
            }),
            upsert: async (row: Record<string, unknown>) => {
              state.upserts.push(row)
              return { error: null }
            },
          },
  }),
}))

vi.mock('@/lib/site-limit-override', () => ({
  getActiveSiteLimitOverride: async () => state.override,
}))

import {
  ADD_ONS,
  resolveEcommerceSiteLimit,
  resolveEffectiveProductLimit,
  resolveEffectiveSiteLimit,
  sumActiveAddOnCapacity,
  type AddOnCode,
  type AddOnGrant,
} from '@/lib/add-ons'
import {
  getEffectiveProductLimit,
  getEffectiveSiteLimit,
  grantAddOn,
} from '@/lib/effective-limits'
import { PRODUCT_LIMITS, SITE_LIMITS } from '@/lib/pricing-config'

const FUTURE = '2099-01-01T00:00:00Z'

const grant = (addonCode: string, extra: Partial<AddOnGrant> = {}): AddOnGrant => ({
  addonCode,
  status: 'active',
  startsAt: null,
  expiresAt: null,
  subscriptionId: 's1',
  subscriptionStatus: 'active',
  subscriptionPeriodEnd: FUTURE,
  ...extra,
})

const row = (code: string, sub: Record<string, unknown> | null = { id: 's1', status: 'active', current_period_end: FUTURE }) => ({
  addon_code: code,
  status: 'active',
  starts_at: null,
  expires_at: FUTURE,
  subscription_id: 's1',
  billing_subscriptions: sub,
})

const activeSub = (extra: Record<string, unknown> = {}) => ({
  id: 's1',
  user_id: 'u1',
  status: 'active',
  current_period_end: FUTURE,
  billing_plans: { code: 'pro' },
  ...extra,
})

beforeEach(() => {
  state.rows = []
  state.override = null
  state.upserts = []
  state.failRead = false
  state.sub = activeSub()
})

describe('base limits', () => {
  it('PRO is 50 products and EC is 150 products', () => {
    expect(PRODUCT_LIMITS.pro).toBe(50)
    expect(PRODUCT_LIMITS.ecommerce).toBe(150)
  })
})

describe('extra site add-ons', () => {
  const cases: Array<[AddOnCode, number]> = [
    ['extra_site_1', 1],
    ['extra_site_3', 3],
    ['extra_site_5', 5],
  ]

  for (const plan of ['pro', 'ecommerce'] as const) {
    for (const [code, add] of cases) {
      it(`${plan} + ${code} = plan limit + ${add}`, () => {
        expect(resolveEffectiveSiteLimit({ planCode: plan, grants: [grant(code)] })).toBe(
          SITE_LIMITS[plan] + add,
        )
      })
    }
  }

  it('PRO +3 site = 6', () => {
    expect(SITE_LIMITS.pro).toBe(3)
    expect(resolveEffectiveSiteLimit({ planCode: 'pro', grants: [grant('extra_site_3')] })).toBe(6)
  })

  it('stacks multiple purchases', () => {
    expect(
      resolveEffectiveSiteLimit({
        planCode: 'pro',
        grants: [grant('extra_site_1'), grant('extra_site_5')],
      }),
    ).toBe(SITE_LIMITS.pro + 6)
  })
})

describe('extra product add-ons', () => {
  const cases: Array<[AddOnCode, number]> = [
    ['extra_product_100', 100],
    ['extra_product_200', 200],
    ['extra_product_500', 500],
  ]

  for (const plan of ['pro', 'ecommerce'] as const) {
    for (const [code, add] of cases) {
      it(`${plan} + ${code} = base + ${add}`, () => {
        expect(resolveEffectiveProductLimit({ planCode: plan, grants: [grant(code)] })).toBe(
          (PRODUCT_LIMITS[plan] as number) + add,
        )
      })
    }
  }

  it('PRO +200 = 250 and EC +500 = 650', () => {
    expect(
      resolveEffectiveProductLimit({ planCode: 'pro', grants: [grant('extra_product_200')] }),
    ).toBe(250)
    expect(
      resolveEffectiveProductLimit({ planCode: 'ecommerce', grants: [grant('extra_product_500')] }),
    ).toBe(650)
  })

  it('FREE/STARTER get no product add-on capacity and stay unmetered', () => {
    for (const plan of ['free', 'starter']) {
      expect(
        resolveEffectiveProductLimit({ planCode: plan, grants: [grant('extra_product_500')] }),
      ).toBeNull()
      expect(sumActiveAddOnCapacity([grant('extra_product_500')], 'product', plan as 'free')).toBe(0)
    }
  })
})

describe('no purchase / invalid grants', () => {
  it('no add-on = zero extra capacity', () => {
    expect(resolveEffectiveSiteLimit({ planCode: 'pro', grants: [] })).toBe(SITE_LIMITS.pro)
    expect(resolveEffectiveProductLimit({ planCode: 'pro', grants: [] })).toBe(50)
    expect(resolveEffectiveProductLimit({ planCode: 'ecommerce', grants: [] })).toBe(150)
  })

  it('ignores revoked, expired, not-yet-started and unknown-code grants', () => {
    const now = new Date('2026-06-01T00:00:00Z')
    const grants = [
      grant('extra_site_5', { status: 'revoked' }),
      grant('extra_site_5', { subscriptionPeriodEnd: '2026-05-01T00:00:00Z' }),
      grant('extra_site_5', { startsAt: '2026-07-01T00:00:00Z' }),
      grant('extra_site_999'),
    ]
    expect(resolveEffectiveSiteLimit({ planCode: 'pro', grants, now })).toBe(SITE_LIMITS.pro)
  })

  it('a site add-on never counts toward product capacity and vice versa', () => {
    expect(sumActiveAddOnCapacity([grant('extra_site_5')], 'product', 'pro')).toBe(0)
    expect(sumActiveAddOnCapacity([grant('extra_product_100')], 'site', 'pro')).toBe(0)
  })

  it('capacity comes from the catalog only', () => {
    expect(ADD_ONS.extra_site_3.capacity).toBe(3)
    expect(ADD_ONS.extra_product_200.capacity).toBe(200)
  })
})

describe('add-on validity follows the subscription period', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  const siteLimit = (g: AddOnGrant) =>
    resolveEffectiveSiteLimit({ planCode: 'pro', grants: [g], now })

  it('is active while the subscription is entitled and the period has not ended', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(siteLimit(grant('extra_site_3', { subscriptionStatus: status }))).toBe(SITE_LIMITS.pro + 3)
    }
  })

  it('grants no capacity without a subscription', () => {
    expect(
      siteLimit(grant('extra_site_3', { subscriptionId: null, subscriptionStatus: null, subscriptionPeriodEnd: null })),
    ).toBe(SITE_LIMITS.pro)
  })

  it('grants no capacity once the subscription is canceled, expired or incomplete', () => {
    for (const status of ['canceled', 'expired', 'incomplete', 'unpaid']) {
      expect(siteLimit(grant('extra_site_3', { subscriptionStatus: status }))).toBe(SITE_LIMITS.pro)
    }
  })

  it('grants no capacity after the billing period end', () => {
    expect(siteLimit(grant('extra_site_3', { subscriptionPeriodEnd: '2026-05-31T23:59:59Z' }))).toBe(
      SITE_LIMITS.pro,
    )
  })

  it('follows a renewed period even when the stored snapshot is stale', () => {
    expect(
      siteLimit(grant('extra_site_3', { expiresAt: '2026-05-01T00:00:00Z', subscriptionPeriodEnd: '2026-07-01T00:00:00Z' })),
    ).toBe(SITE_LIMITS.pro + 3)
  })

  it('grants no capacity when no period end is known at all', () => {
    expect(siteLimit(grant('extra_site_3', { expiresAt: null, subscriptionPeriodEnd: null }))).toBe(
      SITE_LIMITS.pro,
    )
  })
})

describe('admin override', () => {
  it('override replaces the plan base and add-ons stack on top', () => {
    expect(
      resolveEffectiveSiteLimit({ planCode: 'pro', override: 10, grants: [grant('extra_site_3')] }),
    ).toBe(13)
    expect(resolveEffectiveSiteLimit({ planCode: 'pro', override: 10, grants: [] })).toBe(10)
  })
})

describe('e-commerce site allowance', () => {
  it('is 1 and unchanged by extra site add-ons (3 corporate + 1 e-commerce)', () => {
    const grants = [grant('extra_site_1'), grant('extra_site_3'), grant('extra_site_5')]
    expect(resolveEcommerceSiteLimit('ecommerce')).toBe(1)
    expect(resolveEffectiveSiteLimit({ planCode: 'ecommerce', grants })).toBe(SITE_LIMITS.ecommerce + 9)
    expect(resolveEcommerceSiteLimit('ecommerce')).toBe(1)
    expect(resolveEcommerceSiteLimit('pro')).toBe(0)
  })
})

describe('server-side resolvers (DB backed)', () => {
  it('reads grants for the user and adds them to the plan limits', async () => {
    state.rows = [row('extra_site_3'), row('extra_product_200')]
    expect(await getEffectiveSiteLimit('u1', 'pro')).toBe(6)
    expect(await getEffectiveProductLimit('u1', 'pro')).toBe(250)
  })

  it('applies the admin override as the site base', async () => {
    state.override = 8
    state.rows = [row('extra_site_1')]
    expect(await getEffectiveSiteLimit('u1', 'pro')).toBe(9)
  })

  it('no rows = plan limit; read failure fails closed to plan limit', async () => {
    expect(await getEffectiveProductLimit('u1', 'ecommerce')).toBe(150)
    state.failRead = true
    state.rows = [row('extra_product_500')]
    expect(await getEffectiveProductLimit('u1', 'ecommerce')).toBe(150)
  })

  it('enforcement decision: count at the effective limit is rejected, below is allowed', async () => {
    const canAdd = async (count: number) => {
      const limit = await getEffectiveProductLimit('u1', 'pro')
      return limit === null || count < limit
    }
    expect(await canAdd(49)).toBe(true)
    expect(await canAdd(50)).toBe(false)
    state.rows = [row('extra_product_100')]
    expect(await canAdd(50)).toBe(true)
    expect(await canAdd(150)).toBe(false)
  })

  it('ignores rows whose subscription is canceled, missing or past its period', async () => {
    state.rows = [
      row('extra_site_3', { id: 's1', status: 'canceled', current_period_end: FUTURE }),
      row('extra_site_3', null),
      row('extra_site_3', { id: 's1', status: 'active', current_period_end: '2020-01-01T00:00:00Z' }),
    ]
    expect(await getEffectiveSiteLimit('u1', 'pro')).toBe(SITE_LIMITS.pro)
  })

  it('accepts the embedded subscription as a one-item array', async () => {
    state.rows = [row('extra_site_3', [{ id: 's1', status: 'active', current_period_end: FUTURE }] as never)]
    expect(await getEffectiveSiteLimit('u1', 'pro')).toBe(SITE_LIMITS.pro + 3)
  })

  it('grantAddOn ties the grant to the subscription and its period end', async () => {
    const res = await grantAddOn({
      userId: 'u1',
      addonCode: 'extra_site_3',
      subscriptionId: 's1',
      idempotencyKey: 'k1',
    })
    expect(res).toEqual({ ok: true })
    expect(state.upserts[0]).toMatchObject({
      addon_code: 'extra_site_3',
      kind: 'site',
      idempotency_key: 'k1',
      subscription_id: 's1',
      expires_at: FUTURE,
    })
    expect(state.upserts[0]).not.toHaveProperty('capacity')
  })

  it('grantAddOn rejects invalid code, blank key, unknown/inactive subscription and ineligible plans', async () => {
    const base = { userId: 'u1', subscriptionId: 's1', idempotencyKey: 'k' }
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_999' as AddOnCode })).toEqual({
      ok: false,
      error: 'invalid_addon',
    })
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_3', idempotencyKey: ' ' })).toEqual({
      ok: false,
      error: 'invalid_key',
    })
    state.sub = null
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_3' })).toEqual({
      ok: false,
      error: 'subscription_not_found',
    })
    state.sub = activeSub({ status: 'canceled' })
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_3' })).toEqual({
      ok: false,
      error: 'subscription_inactive',
    })
    state.sub = activeSub({ current_period_end: '2020-01-01T00:00:00Z' })
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_3' })).toEqual({
      ok: false,
      error: 'subscription_inactive',
    })
    state.sub = activeSub({ billing_plans: { code: 'starter' } })
    expect(await grantAddOn({ ...base, addonCode: 'extra_site_3' })).toEqual({
      ok: false,
      error: 'not_eligible',
    })
    expect(state.upserts).toHaveLength(0)
  })
})
