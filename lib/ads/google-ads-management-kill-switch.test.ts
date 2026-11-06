import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordPolicyBlock: vi.fn(async () => undefined),
  logUserEvent: vi.fn(async () => undefined),
  gate: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify', () => ({ logUserEvent: mocks.logUserEvent }))
vi.mock('@/lib/ads/google-ads-audit', () => ({ recordGoogleAdsPolicyBlock: mocks.recordPolicyBlock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/ads/google-ads-publish', () => ({
  withGoogleAdsPublishAccess: async (input: { action: (access: unknown) => Promise<unknown> }) => input.action(fakeAccess()),
}))
vi.mock('@/lib/ads/google-publish-route', () => ({
  requireGoogleAdsPublishRequest: mocks.gate,
  publishGateResponse: (gate: object) => 'response' in gate,
}))
vi.mock('@/lib/ads/google-route-utils', async () => {
  const errors = await import('@/lib/ads/google-ads-error')
  return {
    googleAdsJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
    googleAdsErrorResponse: (error: unknown) => {
      const code = errors.googleAdsErrorCode(error)
      return new Response(JSON.stringify({ ok: false, error: code }), { status: errors.googleAdsHttpStatus(code) })
    },
  }
})

import { hashGoogleAdsApprovalPayload } from '@/lib/ads/google-ads-approval'
import { applyGoogleAdsManagementAction } from '@/lib/ads/google-ads-management'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import { POST } from '@/app/api/ads/google/management/route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const ACTION_ID = '123e4567-e89b-42d3-a456-426614174002'
const UNDO_ID = '123e4567-e89b-42d3-a456-426614174003'
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000'
const IDENTITY = { emailConfirmed: true, isAdmin: true }

type CampaignState = {
  campaignId: string
  campaignStatus: 'ENABLED' | 'PAUSED' | 'REMOVED' | 'UNKNOWN'
  dailyBudgetMicros: string
  headlines: string[]
  descriptions: string[]
  keywords: never[]
  budgetResourceName: string
  adResourceName: string
}

const HEADLINES = ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti']
const DESCRIPTIONS = ['Kurumsal web tasarım hizmetlerini keşfedin.', 'Web siteniz için bakım desteği alın.']

function baseState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    campaignId: '456789',
    campaignStatus: 'PAUSED',
    dailyBudgetMicros: '150000000',
    headlines: HEADLINES,
    descriptions: DESCRIPTIONS,
    keywords: [],
    budgetResourceName: 'customers/1234567890/campaignBudgets/1',
    adResourceName: 'customers/1234567890/adGroupAds/1~2',
    ...overrides,
  }
}

function hashOf(state: CampaignState) {
  return hashGoogleAdsApprovalPayload({
    campaignId: state.campaignId,
    campaignStatus: state.campaignStatus,
    dailyBudgetMicros: state.dailyBudgetMicros,
    headlines: state.headlines,
    descriptions: state.descriptions,
    keywords: state.keywords,
  })
}

function publicState(state: CampaignState) {
  const { budgetResourceName: _budget, adResourceName: _ad, ...rest } = state
  void _budget
  void _ad
  return rest
}

let campaign: CampaignState
let originalAction: Record<string, unknown> | null
const providerCalls = {
  setCampaignStatus: vi.fn(),
  updateCampaignBudget: vi.fn(),
  updateResponsiveSearchAd: vi.fn(),
}

function fakeAccess() {
  return {
    connection: {
      id: CONNECTION_ID,
      external_account_id: '1234567890',
      login_customer_id: null,
      currency_code: 'TRY',
      is_manager: false,
      status: 'active',
    },
    accessToken: 'private-access-token',
    context: { userId: USER_ID, connectionId: CONNECTION_ID },
    provider: {
      getCampaignManagementState: async () => ({ ...campaign }),
      getAdReviewStatus: async () => ({ status: 'approved', adCount: 1 }),
      verifyBilling: async () => ({ verified: true, paymentMethodWarning: false }),
      getPerformance: async () => ({ campaigns: [] }),
      setCampaignStatus: async (input: { status: 'enabled' | 'paused'; validateOnly: boolean }) => {
        providerCalls.setCampaignStatus(input)
        if (!input.validateOnly) campaign = { ...campaign, campaignStatus: input.status === 'enabled' ? 'ENABLED' : 'PAUSED' }
        return { status: input.status, validateOnly: input.validateOnly, billingVerified: true, paymentMethodWarning: false }
      },
      updateCampaignBudget: async (input: { dailyBudgetMicros: string; validateOnly: boolean }) => {
        providerCalls.updateCampaignBudget(input)
        if (!input.validateOnly) campaign = { ...campaign, dailyBudgetMicros: input.dailyBudgetMicros }
        return { validateOnly: input.validateOnly, billingVerified: true, paymentMethodWarning: false }
      },
      updateResponsiveSearchAd: async (input: { headlines: string[]; descriptions: string[]; validateOnly: boolean }) => {
        providerCalls.updateResponsiveSearchAd(input)
        if (!input.validateOnly) campaign = { ...campaign, headlines: input.headlines, descriptions: input.descriptions }
        return { validateOnly: input.validateOnly, billingVerified: true, paymentMethodWarning: false }
      },
    },
  }
}

function fakeAdmin() {
  const query = (result: unknown) => {
    const q: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'in', 'order', 'limit']) q[name] = () => q
    q.maybeSingle = async () => ({ data: result, error: null })
    return q
  }
  return {
    from: (table: string) => {
      if (table === 'ads_plans') {
        return query({
          id: PLAN_ID,
          user_id: USER_ID,
          connection_id: CONNECTION_ID,
          status: 'published',
          version: 1,
          approved_version: 1,
          currency: 'TRY',
          daily_budget_minor: 15000,
          google_daily_budget_minor: 15000,
          external_campaign_id: '456789',
          plan: {},
        })
      }
      return query(originalAction)
    },
    rpc: (name: string, args: { p_result?: string }) => ({
      maybeSingle: async () => ({
        data: name.includes('begin') ? { state: 'approved' } : { state: args.p_result },
        error: null,
      }),
    }),
  }
}

function actionInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    accessIdentity: IDENTITY,
    planId: PLAN_ID,
    actionId: ACTION_ID,
    expectedVersion: 1,
    expectedStateHash: hashOf(campaign),
    userConfirmed: true,
    ...overrides,
  } as Parameters<typeof applyGoogleAdsManagementAction>[0]
}

function routeRequest(body: Record<string, unknown>) {
  return new Request('https://gloval.example/api/ads/google/management', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://gloval.example' },
    body: JSON.stringify({
      planId: PLAN_ID,
      actionId: ACTION_ID,
      expectedVersion: 1,
      expectedStateHash: hashOf(campaign),
      confirm: true,
      ...body,
    }),
  })
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise
    return 'ok'
  } catch (error) {
    return error instanceof GoogleAdsError ? error.code : `unexpected:${String(error)}`
  }
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
  campaign = baseState()
  originalAction = null
  mocks.gate.mockResolvedValue({ userId: USER_ID, identity: IDENTITY })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Kill switch AÇIK: yönetim servisi (sunucu tarafı)', () => {
  beforeEach(() => vi.stubEnv('GOOGLE_ADS_KILL_SWITCH', '1'))

  it('kampanyayı ENABLED yapmayı engeller ve Google çağrısı yapmaz', async () => {
    const code = await codeOf(applyGoogleAdsManagementAction(actionInput({ action: 'enable', acknowledgedBillingWarning: true })))

    expect(code).toBe('kill_switch_active')
    expect(providerCalls.setCampaignStatus).not.toHaveBeenCalled()
    expect(campaign.campaignStatus).toBe('PAUSED')
    expect(mocks.recordPolicyBlock).toHaveBeenCalledWith(expect.objectContaining({ reason: 'kill_switch_active', operation: 'enable' }))
  })

  it('günlük bütçe ARTIRMAYI engeller', async () => {
    const code = await codeOf(applyGoogleAdsManagementAction(actionInput({ action: 'budget', dailyBudgetMinor: 20000 })))

    expect(code).toBe('kill_switch_active')
    expect(providerCalls.updateCampaignBudget).not.toHaveBeenCalled()
    expect(campaign.dailyBudgetMicros).toBe('150000000')
  })

  it('günlük bütçe AZALTMAYA izin verir', async () => {
    const result = await applyGoogleAdsManagementAction(actionInput({ action: 'budget', dailyBudgetMinor: 10000 }))

    expect(result.action).toBe('budget')
    expect(campaign.dailyBudgetMicros).toBe('100000000')
  })

  it('DURAKLATMA kill switch açıkken de çalışır', async () => {
    campaign = baseState({ campaignStatus: 'ENABLED' })

    const result = await applyGoogleAdsManagementAction(actionInput({ action: 'pause' }))

    expect(result.action).toBe('pause')
    expect(providerCalls.setCampaignStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'paused', validateOnly: false }))
    expect(campaign.campaignStatus).toBe('PAUSED')
  })

  it('reklam metni ve arşivleme (kampanya paused iken) engellenmez', async () => {
    const copy = await applyGoogleAdsManagementAction(actionInput({
      action: 'ad_copy',
      headlines: ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti', 'Güvenilir Web Çözümü'],
      descriptions: DESCRIPTIONS,
    }))
    expect(copy.action).toBe('ad_copy')
  })

  it('DURAKLATMAYI GERİ ALMA (undo => ENABLED) kill switch ile engellenir', async () => {
    originalAction = {
      id: UNDO_ID,
      action_type: 'google_ads_campaign_status_update',
      target: { status: 'PAUSED' },
      before_state: publicState(baseState({ campaignStatus: 'ENABLED' })),
      after_state: publicState(baseState({ campaignStatus: 'PAUSED' })),
      reversible: true,
      status: 'applied',
      undone_of: null,
    }

    const code = await codeOf(applyGoogleAdsManagementAction(actionInput({ action: 'undo', undoActionId: UNDO_ID })))

    expect(code).toBe('kill_switch_active')
    expect(providerCalls.setCampaignStatus).not.toHaveBeenCalled()
    expect(campaign.campaignStatus).toBe('PAUSED')
  })

  it('BÜTÇE AZALTMANIN geri alınması (undo => artış) kill switch ile engellenir', async () => {
    campaign = baseState({ dailyBudgetMicros: '100000000' })
    originalAction = {
      id: UNDO_ID,
      action_type: 'google_ads_budget_update',
      target: { dailyBudgetMinor: 10000, dailyBudgetMicros: '100000000' },
      before_state: publicState(baseState({ dailyBudgetMicros: '150000000' })),
      after_state: publicState(baseState({ dailyBudgetMicros: '100000000' })),
      reversible: true,
      status: 'applied',
      undone_of: null,
    }

    const code = await codeOf(applyGoogleAdsManagementAction(actionInput({ action: 'undo', undoActionId: UNDO_ID })))

    expect(code).toBe('kill_switch_active')
    expect(providerCalls.updateCampaignBudget).not.toHaveBeenCalled()
    expect(campaign.dailyBudgetMicros).toBe('100000000')
  })

  it('BÜTÇE ARTIŞININ geri alınması (undo => azalış) çalışır', async () => {
    campaign = baseState({ dailyBudgetMicros: '150000000' })
    originalAction = {
      id: UNDO_ID,
      action_type: 'google_ads_budget_update',
      target: { dailyBudgetMinor: 15000, dailyBudgetMicros: '150000000' },
      before_state: publicState(baseState({ dailyBudgetMicros: '100000000' })),
      after_state: publicState(baseState({ dailyBudgetMicros: '150000000' })),
      reversible: true,
      status: 'applied',
      undone_of: null,
    }

    const result = await applyGoogleAdsManagementAction(actionInput({ action: 'undo', undoActionId: UNDO_ID }))

    expect(result.action).toBe('budget')
    expect(campaign.dailyBudgetMicros).toBe('100000000')
  })
})

describe('Kill switch AÇIK: /api/ads/google/management rotası', () => {
  beforeEach(() => vi.stubEnv('GOOGLE_ADS_KILL_SWITCH', '1'))

  it('enable isteği 503 kill_switch_active döner (arayüzden bağımsız)', async () => {
    const response = await POST(routeRequest({ action: 'enable', acknowledgedBillingWarning: true }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'kill_switch_active' })
    expect(providerCalls.setCampaignStatus).not.toHaveBeenCalled()
  })

  it('bütçe artırma isteği 503 kill_switch_active döner', async () => {
    const response = await POST(routeRequest({ action: 'budget', dailyBudgetMinor: 20000 }))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'kill_switch_active' })
    expect(providerCalls.updateCampaignBudget).not.toHaveBeenCalled()
  })

  it('pause isteği 200 döner', async () => {
    campaign = baseState({ campaignStatus: 'ENABLED' })

    const response = await POST(routeRequest({ action: 'pause' }))

    expect(response.status).toBe(200)
    expect(campaign.campaignStatus).toBe('PAUSED')
  })
})

describe('Kill switch KAPALI: aynı işlemler çalışır (kontrol grubu)', () => {
  it('enable ve bütçe artırma izinlidir', async () => {
    const enabled = await applyGoogleAdsManagementAction(actionInput({ action: 'enable', acknowledgedBillingWarning: true }))
    expect(enabled.action).toBe('enable')
    expect(campaign.campaignStatus).toBe('ENABLED')
    expect(mocks.recordPolicyBlock).not.toHaveBeenCalled()
  })
})
