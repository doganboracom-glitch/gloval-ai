import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createGoogleAdsPublishService, type GoogleAdsPublishServiceDeps } from '@/lib/ads/google-ads-publish'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { GoogleAdsConnectionRow } from '@/lib/ads/google-connections'
import type { AdsCampaignPublishResult, AdsCampaignStatusResult, GoogleAdsProvider } from '@/lib/ads/providers/types'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002'

const PLAN_JSON = {
  brand: 'Atölye Sitesi',
  sector: 'services',
  sectorLabel: 'Web Hizmetleri',
  services: ['Kurumsal site tasarımı', 'Web bakım hizmeti'],
  language: 'tr',
  languageFallback: false,
  competitiveness: 'medium',
  keywords: ['kurumsal web tasarımı', 'web sitesi hizmeti', 'web tasarım ajansı'],
  negativeKeywords: ['ücretsiz şablon'],
  country: 'TR',
  cities: ['İstanbul'],
  modelPolicyCategory: null,
  modelPolicyEvidence: 'none',
  finalUrl: 'https://gloval.example/hizmetler',
  adCopy: {
    headlines: ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti'],
    descriptions: ['Kurumsal web tasarım hizmetlerini keşfedin.', 'Web siteniz için bakım desteği alın.'],
    displayUrl: 'https://gloval.example/web-tasarim/kurumsal',
  },
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    connection_id: CONNECTION_ID,
    status: 'approved',
    plan: PLAN_JSON,
    currency: 'TRY',
    daily_budget_minor: 15000,
    budget_cap_minor: 90000,
    external_campaign_id: null,
    publish_billing_verified: null,
    google_campaign_status: 'PAUSED' as const,
    ...overrides,
  }
}

function connection(overrides: Partial<GoogleAdsConnectionRow> = {}): GoogleAdsConnectionRow {
  return {
    id: CONNECTION_ID,
    user_id: USER_ID,
    platform: 'google_ads',
    external_account_id: '1234567890',
    external_account_name: 'Demo account',
    login_customer_id: null,
    currency_code: 'TRY',
    is_manager: false,
    refresh_token_enc: 'encrypted-refresh-token',
    token_key_version: 1,
    scopes: [],
    status: 'active',
    last_error: null,
    api_lease_id: null,
    api_lease_expires_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function setup(options: {
  plan?: ReturnType<typeof plan>
  publishResult?: AdsCampaignPublishResult
  publishError?: Error
  statusResult?: AdsCampaignStatusResult
} = {}) {
  const events: string[] = []
  const provider: Pick<GoogleAdsProvider, 'publishCampaign' | 'setCampaignStatus' | 'verifyBilling'> = {
    publishCampaign: vi.fn<GoogleAdsProvider['publishCampaign']>(async () => {
      events.push('mutate')
      if (options.publishError) throw options.publishError
      return options.publishResult ?? {
        externalCampaignId: '456789',
        status: 'paused',
        validateOnly: false,
        billingVerified: false,
        paymentMethodWarning: true,
      }
    }),
    setCampaignStatus: vi.fn<GoogleAdsProvider['setCampaignStatus']>(async ({ status }) => {
      events.push('status')
      return options.statusResult ?? {
        status,
        billingVerified: status === 'enabled' ? false : null,
        paymentMethodWarning: status === 'enabled',
      }
    }),
    verifyBilling: vi.fn<GoogleAdsProvider['verifyBilling']>(async () => ({
      verified: false,
      paymentMethodWarning: true,
    })),
  }

  const deps: GoogleAdsPublishServiceDeps = {
    accessEnabled: () => true,
    createRequestId: () => REQUEST_ID,
    loadPlan: vi.fn(async () => options.plan ?? plan()),
    withAccess: async ({ action }) => action({
      connection: connection(),
      accessToken: 'private-access-token',
      context: { userId: USER_ID, connectionId: CONNECTION_ID },
      provider,
    }),
    beginPublish: vi.fn(async () => {
      events.push('charge')
      return { ok: true, balance: 85, alreadyCharged: false, chargedAmount: 15 }
    }),
    markPublished: vi.fn(async () => { events.push('published') }),
    markFailed: vi.fn(async () => { events.push('failed') }),
    markReconciling: vi.fn(async () => { events.push('reconciling') }),
    markCampaignStatus: vi.fn(async () => { events.push('status-saved') }),
    refund: vi.fn(async () => ({ balance: 100 })),
    alertReconciling: vi.fn(async () => { events.push('alert') }),
  }

  return { service: createGoogleAdsPublishService(deps), deps, provider, events }
}

describe('Google Ads publish service', () => {
  it('charges 15 credits after plan and connection checks, then records a paused campaign with a billing warning', async () => {
    const { service, deps, provider, events } = setup()

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID })

    expect(result).toMatchObject({
      ok: true,
      state: 'published',
      externalCampaignId: '456789',
      campaignStatus: 'paused',
      billingVerified: false,
      paymentMethodWarning: true,
      creditsCharged: 15,
    })
    expect(events.indexOf('charge')).toBeLessThan(events.indexOf('mutate'))
    expect(deps.beginPublish).toHaveBeenCalledWith(USER_ID, PLAN_ID, REQUEST_ID)
    expect(provider.publishCampaign).toHaveBeenCalledWith(expect.objectContaining({
      planJson: PLAN_JSON,
      validateOnly: false,
      budget: { currency: 'TRY', dailyMinor: 15000, capMinor: 90000 },
    }))
    expect(deps.markPublished).toHaveBeenCalledWith(expect.objectContaining({
      externalCampaignId: '456789',
      billingVerified: false,
    }))
    expect(deps.refund).not.toHaveBeenCalled()
  })

  it('does not charge or mutate when stored plan JSON fails validation', async () => {
    const { service, deps, provider } = setup({ plan: plan({ plan: { ...PLAN_JSON, adCopy: undefined } }) })

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID })

    expect(result).toMatchObject({ ok: false, reason: 'invalid_publish_plan' })
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('runs validate_only without charging credits or changing plan state', async () => {
    const { service, deps, provider } = setup({
      publishResult: {
        externalCampaignId: null,
        status: 'paused',
        validateOnly: true,
        billingVerified: false,
        paymentMethodWarning: true,
      },
    })

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID, validateOnly: true })

    expect(result).toMatchObject({ ok: true, state: 'validated', externalCampaignId: null, creditsCharged: 0 })
    expect(provider.publishCampaign).toHaveBeenCalledWith(expect.objectContaining({ validateOnly: true }))
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(deps.markPublished).not.toHaveBeenCalled()
  })

  it('keeps the charge and records reconciling plus one admin alert after an ambiguous timeout', async () => {
    const { service, deps } = setup({ publishError: new GoogleAdsError('provider_unavailable') })

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID })

    expect(result).toMatchObject({ ok: true, state: 'reconciling', creditsCharged: 15, paymentMethodWarning: true })
    expect(deps.markReconciling).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      reason: 'google_publish_result_unknown',
    }))
    expect(deps.alertReconciling).toHaveBeenCalledWith(PLAN_ID, REQUEST_ID)
    expect(deps.refund).not.toHaveBeenCalled()
  })

  it('refunds a definitive provider rejection and marks the plan failed', async () => {
    const { service, deps } = setup({ publishError: new GoogleAdsError('provider_error') })

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID })

    expect(result).toMatchObject({ ok: false, reason: 'provider_error', balance: 100 })
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      reason: 'provider_error',
    }))
    expect(deps.refund).toHaveBeenCalledWith(USER_ID, REQUEST_ID)
    expect(deps.alertReconciling).not.toHaveBeenCalled()
  })

  it('keeps status changes free and returns the payment warning on go-live', async () => {
    const { service, deps, provider } = setup({
      plan: plan({ status: 'published', external_campaign_id: '456789' }),
      statusResult: { status: 'enabled', billingVerified: false, paymentMethodWarning: true },
    })

    const result = await service.updateCampaignStatus({ userId: USER_ID, planId: PLAN_ID, status: 'enabled' })

    expect(result).toMatchObject({ ok: true, result: { status: 'enabled', paymentMethodWarning: true } })
    expect(provider.setCampaignStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'enabled' }))
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(deps.refund).not.toHaveBeenCalled()
    expect(deps.markCampaignStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'ENABLED' }))
  })

  it('returns an existing publish result without charging twice', async () => {
    const { service, deps, provider } = setup({
      plan: plan({ status: 'published', external_campaign_id: '456789', publish_billing_verified: true }),
    })

    const result = await service.publish({ userId: USER_ID, planId: PLAN_ID })

    expect(result).toMatchObject({ ok: true, state: 'published', externalCampaignId: '456789', creditsCharged: 0 })
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })
})
