import { beforeEach, describe, expect, it, vi } from 'vitest'

type Write = { table: string; op: 'insert' | 'update' | 'upsert' | 'delete'; payload: Record<string, unknown> }

const m = vi.hoisted(() => ({
  user: { id: 'u1', email: 'a@example.com' } as { id: string; email: string } | null,
  subscription: null as Record<string, unknown> | null,
  writes: [] as Array<{ table: string; op: string; payload: Record<string, unknown> }>,
  createIntent: vi.fn(),
  registrar: vi.fn(),
  listDomains: vi.fn(),
  quoteRenewal: vi.fn(),
  prepareTransfer: vi.fn(),
}))

const DAY = 24 * 3600 * 1000
const PLANS: Record<string, Record<string, unknown>> = {
  p_low: { id: 'p_low', code: 'starter', name: 'Starter', price_cents: 10000, currency: 'TRY', interval: 'month', trial_days: 0, active: true },
  p_high: { id: 'p_high', code: 'pro', name: 'Pro', price_cents: 50000, currency: 'TRY', interval: 'month', trial_days: 0, active: true },
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/platform-buyer', () => ({
  resolvePlatformBuyerPublicConfig: async () => ({ buyer: { fullName: 'Ali Veli' } }),
}))
vi.mock('@/lib/notify', () => ({ logUserEvent: vi.fn(), formatTicketNumber: (ref: string) => ref }))
vi.mock('@/lib/mail/access-trigger', () => ({ triggerMailAccessSync: vi.fn() }))
vi.mock('@/lib/payments/init-failure-report', () => ({
  reportPaymentInitFailure: async () => ({ userError: 'payment_init_failed', code: 'test' }),
}))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProviderId: () => 'iyzico',
  getPlatformPaymentProvider: () => ({ capabilities: { synchronous: false }, createIntent: m.createIntent }),
}))

/**
 * Chainable Supabase stand-in. Every write is recorded so a rejected consent is
 * proven by "no row was written and no PSP intent was created".
 */
function makeBuilder(table: string) {
  let op: 'select' | Write['op'] = 'select'
  let payload: Record<string, unknown> = {}
  const eqs: Record<string, unknown> = {}
  const b: Record<string, unknown> = {}
  const fixture = (): unknown => {
    if (table === 'billing_plans') {
      if (typeof eqs.id === 'string') return PLANS[eqs.id] ?? null
      return { code: eqs.code, name: 'Right', price_cents: 100000, currency: 'TRY', active: true }
    }
    if (table === 'billing_subscriptions') return m.subscription
    if (table === 'projects') return { id: 'proj1', name: 'Site', slug: 'site' }
    return null
  }
  const write = (kind: Write['op']) => (v?: Record<string, unknown>) => {
    op = kind
    payload = v ?? {}
    m.writes.push({ table, op: kind, payload })
    return b
  }
  b.select = () => b
  b.insert = write('insert')
  b.update = write('update')
  b.upsert = write('upsert')
  b.delete = write('delete')
  for (const f of ['eq', 'in', 'is', 'gte', 'lt', 'order', 'limit', 'neq']) {
    b[f] = (k?: string, v?: unknown) => {
      if (f === 'eq' && k) eqs[k] = v
      return b
    }
  }
  const one = async () =>
    op === 'insert' || op === 'upsert'
      ? { data: { id: 'new_1', ...payload }, error: null }
      : op === 'select'
        ? { data: fixture(), error: null }
        : { data: null, error: null }
  b.maybeSingle = one
  b.single = one
  b.then = (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: m.user } }) },
    from: (t: string) => makeBuilder(t),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))

vi.mock('@/lib/custom-domains/registrar/provider', () => ({ getDomainRegistrarProvider: m.registrar }))
vi.mock('@/lib/custom-domains/registrar/service', () => ({
  finalizeDomainOrder: vi.fn(),
  parsePurchaseDomain: vi.fn(),
  searchDomainAvailability: vi.fn(),
}))
vi.mock('@/lib/custom-domains/registrar/renewal-service', () => ({
  finalizeRenewal: vi.fn(),
  getLatestRenewal: vi.fn(),
  quoteRenewal: m.quoteRenewal,
}))
vi.mock('@/lib/custom-domains/registrar/transfer-service', () => ({
  finalizeTransferIn: vi.fn(),
  isTransferSupportedTld: () => true,
  syncTransfersForUser: vi.fn(),
}))
vi.mock('@/lib/custom-domains/registrar/transfer-crypto', () => ({
  encryptAuthCode: m.prepareTransfer,
  isTransferSecretConfigured: () => true,
}))
vi.mock('@/lib/custom-domains/service', () => ({ listDomainsForUser: m.listDomains }))
vi.mock('@/lib/custom-domains/access', () => ({ getDomainEntitlement: vi.fn() }))
vi.mock('@/lib/custom-domains/pricing/context', () => ({ loadPricingContext: vi.fn() }))

import {
  buildConsentColumns,
  CHECKOUT_CONSENT_VERSION,
  CONSENT_REQUIRED_ERROR,
  hasAllCheckoutConsents,
} from '@/lib/checkout-consent'
import { changePlan, renewSubscription, subscribeToPlan } from '@/lib/billing'
import { purchaseCreditTopUp } from '@/lib/credit-topups'
import { purchaseBrandingRemoval, purchaseMultilangPackage } from '@/lib/project-entitlements'
import { purchaseAddOn } from '@/lib/addon-purchase-actions'
import { startMyDomainPurchase } from '@/lib/custom-domains/registrar/actions'
import { startMyDomainRenewal } from '@/lib/custom-domains/registrar/renew-actions'
import { startMyTransferIn } from '@/lib/custom-domains/registrar/transfer-actions'

const ALL = { preInfo: true, distance: true, withdrawal: true }

const INVALID_CONSENTS: Array<[string, unknown]> = [
  ['undefined', undefined],
  ['empty object', {}],
  ['all three false', { preInfo: false, distance: false, withdrawal: false }],
  ['preInfo missing', { distance: true, withdrawal: true }],
  ['distance false', { preInfo: true, distance: false, withdrawal: true }],
  ['withdrawal false', { preInfo: true, distance: true, withdrawal: false }],
  ['truthy but not boolean true', { preInfo: 'true', distance: 1, withdrawal: true }],
]

const contact = { firstName: 'A', lastName: 'B' } as never

const FLOWS: Array<[string, (c: unknown) => Promise<unknown>, string]> = [
  ['first subscription (subscribeToPlan)', (c) => subscribeToPlan('p_high', c as never), 'consent_required'],
  ['paid upgrade (changePlan)', (c) => changePlan('p_high', c as never), 'consent_required'],
  ['renewal (renewSubscription)', (c) => renewSubscription(c as never), 'consent_required'],
  ['AI credit pack (purchaseCreditTopUp)', (c) => purchaseCreditTopUp('ai_50', c as never), 'consent_required'],
  ['Copyright removal (purchaseBrandingRemoval)', (c) => purchaseBrandingRemoval('proj1', c as never), 'consent_required'],
  ['multilang package (purchaseMultilangPackage)', (c) => purchaseMultilangPackage('proj1', c as never), 'consent_required'],
  ['add-on: extra site/product/mail (purchaseAddOn)', (c) => purchaseAddOn({ addonCode: 'extra_site_1', consents: c as never }), 'consent_required'],
  ['domain purchase (startMyDomainPurchase)', (c) => startMyDomainPurchase('example.com', 1, contact, c as never), 'CONSENT_REQUIRED'],
  ['domain renewal (startMyDomainRenewal)', (c) => startMyDomainRenewal('example.com', 1, c as never), 'CONSENT_REQUIRED'],
  ['domain transfer (startMyTransferIn)', (c) => startMyTransferIn('example.com', 'AUTHCODE', c as never), 'CONSENT_REQUIRED'],
]

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MULTILANG_FEATURE_UI = 'true'
  m.user = { id: 'u1', email: 'a@example.com' }
  m.writes = []
  m.subscription = {
    id: 's1',
    user_id: 'u1',
    plan_id: 'p_low',
    status: 'active',
    current_period_start: new Date(Date.now() - 10 * DAY).toISOString(),
    current_period_end: new Date(Date.now() + 20 * DAY).toISOString(),
  }
  m.createIntent.mockResolvedValue({
    status: 'pending',
    action: 'redirect',
    reference: 'tok_1',
    redirectUrl: 'https://sandbox-cpp.iyzipay.com/pay/tok_1',
  })
})

describe('checkout consent primitives', () => {
  it('accepts only exactly three true flags', () => {
    expect(hasAllCheckoutConsents(ALL)).toBe(true)
    for (const [, value] of INVALID_CONSENTS) expect(hasAllCheckoutConsents(value)).toBe(false)
    expect(hasAllCheckoutConsents(null)).toBe(false)
  })

  it('builds evidence columns on the server with version, three flags and an ISO timestamp', () => {
    const at = new Date('2026-03-01T10:00:00.000Z')
    expect(buildConsentColumns(at)).toEqual({
      consent_version: CHECKOUT_CONSENT_VERSION,
      consent_pre_info: true,
      consent_distance: true,
      consent_withdrawal: true,
      consented_at: '2026-03-01T10:00:00.000Z',
    })
  })

  it('stores no IP, personal data or consent text', () => {
    expect(Object.keys(buildConsentColumns()).sort()).toEqual([
      'consent_distance',
      'consent_pre_info',
      'consent_version',
      'consent_withdrawal',
      'consented_at',
    ])
  })
})

describe.each(FLOWS)('server rejects missing consent: %s', (_name, run, expectedError) => {
  it.each(INVALID_CONSENTS)('%s -> rejected, no intent, no row written', async (_label, consents) => {
    const result = await run(consents)
    expect(result).toEqual({ ok: false, error: expectedError })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(m.writes).toEqual([])
    expect(m.registrar).not.toHaveBeenCalled()
    expect(m.quoteRenewal).not.toHaveBeenCalled()
    expect(m.prepareTransfer).not.toHaveBeenCalled()
  })
})

describe('flows that move no money need no consent', () => {
  it('a downgrade does not demand consent and never starts a payment', async () => {
    m.subscription = { ...m.subscription, plan_id: 'p_high' }
    const result = await changePlan('p_low', undefined)
    expect(result).not.toMatchObject({ error: CONSENT_REQUIRED_ERROR })
    expect(m.createIntent).not.toHaveBeenCalled()
  })
})

describe('consent evidence is written with the payment record', () => {
  const consentColumns = {
    consent_version: CHECKOUT_CONSENT_VERSION,
    consent_pre_info: true,
    consent_distance: true,
    consent_withdrawal: true,
  }
  const txWrites = () => m.writes.filter((w) => w.table === 'billing_transactions')

  it('first subscription charge', async () => {
    m.subscription = null
    const result = await subscribeToPlan('p_high', ALL)
    expect(result).toMatchObject({ ok: true })
    expect(txWrites()).toHaveLength(1)
    expect(txWrites()[0].payload).toMatchObject(consentColumns)
    expect(typeof txWrites()[0].payload.consented_at).toBe('string')
  })

  it('plan upgrade difference', async () => {
    const result = await changePlan('p_high', ALL)
    expect(result).toMatchObject({ ok: true, status: 'incomplete' })
    expect(txWrites()[0].payload).toMatchObject(consentColumns)
  })

  it('AI credit pack', async () => {
    const result = await purchaseCreditTopUp('ai_50', ALL)
    expect(result).toMatchObject({ ok: true })
    expect(txWrites()[0].payload).toMatchObject(consentColumns)
  })

  it('Copyright removal', async () => {
    const result = await purchaseBrandingRemoval('proj1', ALL)
    expect(result).toMatchObject({ ok: true })
    expect(txWrites()[0].payload).toMatchObject(consentColumns)
  })

  it('multilang package', async () => {
    const result = await purchaseMultilangPackage('proj1', ALL)
    expect(result).toMatchObject({ ok: true })
    expect(txWrites()[0].payload).toMatchObject(consentColumns)
  })
})
