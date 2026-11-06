import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createGoogleAdsPublishService, type GoogleAdsPublishServiceDeps } from '@/lib/ads/google-ads-publish'
import { GoogleAdsError } from '@/lib/ads/google-ads-error'
import type { AdsPublishBeginResult } from '@/lib/ads/credits'
import { createGoogleAdsPlanApprovalHash } from '@/lib/ads/google-ads-approval'
import { parseGoogleAdsPublishPlan } from '@/lib/ads/google-ads-publish-plan'
import type { GoogleAdsPublishPreflightResult } from '@/lib/ads/google-ads-publish-preflight'
import type { GoogleAdsConnectionRow } from '@/lib/ads/google-connections'
import type {
  AdsCampaignPublishResult,
  AdsCampaignStatusResult,
  GoogleAdsAdReviewStatus,
  GoogleAdsProvider,
} from '@/lib/ads/providers/types'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const CONNECTION_ID = '123e4567-e89b-42d3-a456-426614174000'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002'
const APPROVAL_ID = '123e4567-e89b-42d3-a456-426614174003'

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
  euPoliticalAdvertising: 'no',
  euPoliticalDeclarationConfirmed: true,
  finalUrl: 'https://gloval.example/hizmetler',
  adCopy: {
    headlines: ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti'],
    descriptions: ['Kurumsal web tasarım hizmetlerini keşfedin.', 'Web siteniz için bakım desteği alın.'],
    displayUrl: 'https://gloval.example/web-tasarim/kurumsal',
  },
}
const APPROVED_PLAN = parseGoogleAdsPublishPlan(PLAN_JSON)
const APPROVAL_HASH = createGoogleAdsPlanApprovalHash({
  userId: USER_ID,
  planId: PLAN_ID,
  planVersion: 1,
  connectionId: CONNECTION_ID,
  customerId: '1234567890',
  currency: 'TRY',
  dailyBudgetMinor: 15000,
  budgetCapMinor: 90000,
  userDailyBudgetCapMinor: 200000,
  plan: APPROVED_PLAN,
})

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    user_id: USER_ID,
    connection_id: CONNECTION_ID,
    status: 'approved',
    plan: PLAN_JSON,
    version: 1,
    approved_version: 1,
    approval_summary: {},
    approval_id: APPROVAL_ID,
    approval_hash: APPROVAL_HASH,
    validation_hash: APPROVAL_HASH,
    validated_version: 1,
    validated_at: new Date(0).toISOString(),
    eu_political_advertising: 'no' as const,
    eu_political_declaration_confirmed_at: new Date(0).toISOString(),
    approval_user_daily_budget_limit_minor: 200000,
    publish_credit_charged: false,
    google_daily_budget_minor: null,
    currency: 'TRY',
    daily_budget_minor: 15000,
    budget_cap_minor: 90000,
    external_campaign_id: null,
    publish_request_id: null,
    publish_started_at: null,
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
  reviewStatus?: GoogleAdsAdReviewStatus
  beginPublishResult?: AdsPublishBeginResult
  preflightResult?: GoogleAdsPublishPreflightResult
  connection?: Partial<GoogleAdsConnectionRow>
  accessEnabled?: boolean
  validationTestEnabled?: boolean
  finalizeResult?: { ok: true; balance: number; alreadyCharged: boolean; chargedAmount: number } | { ok: false; reason: 'insufficient_credits' | 'finalize_failed'; balance: number }
} = {}) {
  const events: string[] = []
  const provider: Pick<
    GoogleAdsProvider,
    | 'publishCampaign'
    | 'setCampaignStatus'
    | 'verifyBilling'
    | 'getAdReviewStatus'
    | 'getCampaignManagementState'
    | 'updateCampaignBudget'
    | 'updateResponsiveSearchAd'
  > = {
    publishCampaign: vi.fn<GoogleAdsProvider['publishCampaign']>(async (input) => {
      events.push(input.validateOnly ? 'validateOnly' : 'mutate')
      if (options.publishError) throw options.publishError
      return options.publishResult ?? {
        externalCampaignId: '456789',
        status: 'paused',
        validateOnly: input.validateOnly,
        billingVerified: false,
        paymentMethodWarning: true,
      }
    }),
    setCampaignStatus: vi.fn<GoogleAdsProvider['setCampaignStatus']>(async ({ status, validateOnly }) => {
      events.push('status')
      return options.statusResult ?? {
        status,
        validateOnly,
        billingVerified: status === 'enabled' ? false : null,
        paymentMethodWarning: status === 'enabled',
      }
    }),
    verifyBilling: vi.fn<GoogleAdsProvider['verifyBilling']>(async () => ({ verified: false, paymentMethodWarning: true })),
    getAdReviewStatus: vi.fn<GoogleAdsProvider['getAdReviewStatus']>(async () => {
      events.push('review')
      return options.reviewStatus ?? { status: 'approved', adCount: 1 }
    }),
    getCampaignManagementState: vi.fn<GoogleAdsProvider['getCampaignManagementState']>(async () => ({
      campaignId: '456789',
      campaignStatus: 'PAUSED',
      budgetResourceName: 'customers/1234567890/campaignBudgets/1',
      dailyBudgetMicros: '150000000',
      adResourceName: 'customers/1234567890/adGroupAds/1~2',
      headlines: ['Atölye Sitesi', 'Kurumsal Web Tasarımı', 'Web Bakım Hizmeti'],
      descriptions: ['Kurumsal web tasarım hizmetlerini keşfedin.', 'Web siteniz için bakım desteği alın.'],
    })),
    updateCampaignBudget: vi.fn<GoogleAdsProvider['updateCampaignBudget']>(async () => ({
      validateOnly: false, billingVerified: true, paymentMethodWarning: false,
    })),
    updateResponsiveSearchAd: vi.fn<GoogleAdsProvider['updateResponsiveSearchAd']>(async () => ({
      validateOnly: false, billingVerified: true, paymentMethodWarning: false,
    })),
  }

  const deps: GoogleAdsPublishServiceDeps = {
    accessEnabled: () => options.accessEnabled ?? true,
    reservePublishCapacity: vi.fn(async () => ({ actionId: 'publish-capacity' })),
    finishPublishCapacity: vi.fn(async () => {}),
    validationTestEnabled: () => options.validationTestEnabled ?? false,
    createRequestId: () => REQUEST_ID,
    loadPlan: vi.fn(async () => options.plan ?? plan()),
    withAccess: vi.fn(async ({ action }) => {
      events.push('access')
      return action({
        connection: connection(options.connection),
        accessToken: 'private-access-token',
        context: { userId: USER_ID, connectionId: CONNECTION_ID },
        provider,
      })
    }),
    preflightPublishUrl: vi.fn(async () => {
      events.push('preflight')
      return options.preflightResult ?? { ok: true as const }
    }),
    beginPublish: vi.fn(async () => {
      events.push('reserve')
      return options.beginPublishResult ?? { ok: true as const, balance: 85, alreadyCharged: false, chargedAmount: 0 }
    }),
    markValidated: vi.fn(async () => { events.push('validated') }),
    markPublished: vi.fn(async () => {
      events.push('charge')
      return options.finalizeResult ?? { ok: true as const, balance: 70, alreadyCharged: false, chargedAmount: 15 }
    }),
    markFailed: vi.fn(async () => { events.push('released') }),
    markReconciling: vi.fn(async () => { events.push('reconciling') }),
    markCampaignStatus: vi.fn(async () => { events.push('status-saved') }),
    alertReconciling: vi.fn(async () => { events.push('alert') }),
    alertPublishFailure: vi.fn(async () => { events.push('publish-alert') }),
  }

  return { service: createGoogleAdsPublishService(deps), deps, provider, events }
}

const confirmedPublish = {
  userId: USER_ID,
  planId: PLAN_ID,
  expectedVersion: 1,
  approvalHash: APPROVAL_HASH,
  userConfirmed: true,
  finalConfirmation: true,
}

describe('Google Ads E2 publish service', () => {
  it('requires a separate final confirmation before a real campaign mutation', async () => {
    const { service, deps, provider } = setup()

    expect(await service.publish({ ...confirmedPublish, finalConfirmation: false }))
      .toMatchObject({ ok: false, reason: 'confirmation_required' })
    expect(deps.loadPlan).not.toHaveBeenCalled()
    expect(deps.preflightPublishUrl).not.toHaveBeenCalled()
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('allows an admin-gated validate_only test while live publishing is off without persisting plan state', async () => {
    const { service, deps, provider } = setup({
      accessEnabled: false,
      validationTestEnabled: true,
      plan: plan({
        status: 'draft',
        approved_version: null,
        approval_id: null,
        approval_hash: null,
        validation_hash: null,
        validated_version: null,
        eu_political_advertising: null,
        eu_political_declaration_confirmed_at: null,
        approval_user_daily_budget_limit_minor: null,
      }),
      publishResult: {
        externalCampaignId: null,
        status: 'paused',
        validateOnly: true,
        billingVerified: true,
        paymentMethodWarning: false,
      },
    })

    const result = await service.publish({
      userId: USER_ID,
      planId: PLAN_ID,
      userConfirmed: true,
      validateOnly: true,
      validationTestMode: true,
      euPoliticalAdvertising: 'no',
      euPoliticalDeclarationConfirmed: true,
    })

    expect(result).toMatchObject({ ok: true, state: 'validation_test_passed', externalCampaignId: null, creditsCharged: 0 })
    expect(provider.publishCampaign).toHaveBeenCalledWith(expect.objectContaining({
      validateOnly: true,
      validationTestMode: true,
      userConfirmed: true,
    }))
    expect(deps.markValidated).not.toHaveBeenCalled()
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(deps.markPublished).not.toHaveBeenCalled()
  })

  it('keeps validate_only test mode closed unless its separate server flag is enabled', async () => {
    const { service, deps, provider } = setup({ accessEnabled: false, validationTestEnabled: false })

    expect(await service.publish({
      userId: USER_ID,
      planId: PLAN_ID,
      userConfirmed: true,
      validateOnly: true,
      validationTestMode: true,
    })).toMatchObject({ ok: false, reason: 'publish_disabled' })
    expect(deps.loadPlan).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation and the exact approval hash before any preflight or provider call', async () => {
    const { service, deps, provider } = setup()

    expect(await service.publish({ ...confirmedPublish, userConfirmed: false }))
      .toMatchObject({ ok: false, reason: 'confirmation_required' })
    expect(await service.publish({ ...confirmedPublish, approvalHash: '0'.repeat(64) }))
      .toMatchObject({ ok: false, reason: 'plan_changed' })
    expect(deps.preflightPublishUrl).not.toHaveBeenCalled()
    expect(deps.withAccess).not.toHaveBeenCalled()
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('validates the approved plan with validate_only and persists the exact version without reserving credits', async () => {
    const { service, deps, provider, events } = setup({
      publishResult: {
        externalCampaignId: null,
        status: 'paused',
        validateOnly: true,
        billingVerified: true,
        paymentMethodWarning: false,
      },
    })

    const result = await service.publish({ ...confirmedPublish, validateOnly: true })

    expect(result).toMatchObject({ ok: true, state: 'validated', creditsCharged: 0 })
    expect(provider.publishCampaign).toHaveBeenCalledWith(expect.objectContaining({
      validateOnly: true,
      userConfirmed: true,
      planJson: expect.objectContaining({ euPoliticalAdvertising: 'no', euPoliticalDeclarationConfirmed: true }),
    }))
    expect(deps.markValidated).toHaveBeenCalledWith({
      userId: USER_ID,
      planId: PLAN_ID,
      expectedVersion: 1,
      approvalId: APPROVAL_ID,
      approvalHash: APPROVAL_HASH,
    })
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(deps.markPublished).not.toHaveBeenCalled()
    expect(events).toContain('validated')
  })

  it('blocks a real publish until the exact approved version has a matching validation record', async () => {
    const { service, deps, provider } = setup({ plan: plan({ validation_hash: null, validated_version: null }) })

    expect(await service.publish(confirmedPublish)).toMatchObject({ ok: false, reason: 'confirmation_required' })
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('creates paused and charges 15 credits only after the provider confirms success', async () => {
    const { service, deps, provider, events } = setup()

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({
      ok: true,
      state: 'published',
      externalCampaignId: '456789',
      campaignStatus: 'paused',
      billingVerified: false,
      paymentMethodWarning: true,
      creditsCharged: 15,
      balance: 70,
    })
    expect(events.indexOf('reserve')).toBeLessThan(events.indexOf('mutate'))
    expect(events.indexOf('mutate')).toBeLessThan(events.indexOf('charge'))
    expect(deps.beginPublish).toHaveBeenCalledWith(
      USER_ID,
      PLAN_ID,
      REQUEST_ID,
      1,
      expect.objectContaining({ cpcBidCeilingMinor: 1500, cpcBidCeilingMicros: '15000000' }),
      APPROVAL_ID,
      APPROVAL_HASH,
      200000,
    )
    expect(provider.publishCampaign).toHaveBeenCalledWith(expect.objectContaining({
      planJson: expect.objectContaining({ euPoliticalAdvertising: 'no', euPoliticalDeclarationConfirmed: true }),
      validateOnly: false,
      userConfirmed: true,
      budget: { currency: 'TRY', dailyMinor: 15000, capMinor: 90000 },
    }))
    expect(deps.markPublished).toHaveBeenCalledWith(expect.objectContaining({
      externalCampaignId: '456789',
      billingVerified: false,
    }))
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('does not call Google when the user has insufficient credits', async () => {
    const { service, deps, provider } = setup({
      beginPublishResult: { ok: false, reason: 'insufficient_credits', balance: 2 },
    })

    expect(await service.publish(confirmedPublish)).toMatchObject({ ok: false, reason: 'insufficient_credits', balance: 2 })
    expect(provider.publishCampaign).not.toHaveBeenCalled()
    expect(deps.markPublished).not.toHaveBeenCalled()
  })

  it('keeps a reservation in reconciling after an ambiguous provider timeout and does not charge', async () => {
    const { service, deps } = setup({ publishError: new GoogleAdsError('provider_unavailable') })

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({ ok: true, state: 'reconciling', creditsCharged: null, balance: 85 })
    expect(deps.markReconciling).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      reason: 'google_publish_result_unknown',
    }))
    expect(deps.markPublished).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(deps.alertReconciling).toHaveBeenCalledWith(PLAN_ID, REQUEST_ID, 'google_publish_result_unknown')
  })

  it('releases the reserved credits on a definitive provider rejection without a refund', async () => {
    const { service, deps, events } = setup({ publishError: new GoogleAdsError('provider_error') })

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({ ok: false, reason: 'provider_error', balance: 85 })
    expect(deps.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      reason: 'provider_error',
    }))
    expect(events).toContain('released')
    expect(deps.alertPublishFailure).toHaveBeenCalledWith(PLAN_ID, REQUEST_ID, 'provider_error', 'publish')
    expect(deps.alertReconciling).not.toHaveBeenCalled()
  })

  it('marks a definitive failure reconciling when releasing the reservation fails', async () => {
    const { service, deps } = setup({ publishError: new GoogleAdsError('provider_error') })
    deps.markFailed = vi.fn(async () => { throw new Error('database unavailable') })

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({ ok: true, state: 'reconciling', creditsCharged: null })
    expect(deps.markReconciling).toHaveBeenCalledWith(expect.objectContaining({ reason: 'publish_failure_persist_failed' }))
    expect(deps.alertReconciling).toHaveBeenCalledWith(PLAN_ID, REQUEST_ID, 'publish_failure_persist_failed')
  })

  it('moves a stale publishing attempt to reconciling without retrying or charging', async () => {
    const { service, deps, provider } = setup({
      plan: plan({
        status: 'publishing',
        publish_request_id: REQUEST_ID,
        publish_started_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      }),
    })

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({ ok: true, state: 'reconciling', creditsCharged: null })
    expect(deps.markReconciling).toHaveBeenCalledWith(expect.objectContaining({ reason: 'publish_stale_timeout', requestId: REQUEST_ID }))
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation before campaign status changes and blocks unreviewed ads', async () => {
    const { service, provider } = setup({
      plan: plan({ status: 'published', external_campaign_id: '456789' }),
      reviewStatus: { status: 'review_in_progress', adCount: 1 },
    })

    expect(await service.updateCampaignStatus({ userId: USER_ID, planId: PLAN_ID, status: 'enabled', userConfirmed: false }))
      .toEqual({ ok: false, reason: 'confirmation_required' })
    expect(await service.updateCampaignStatus({
      userId: USER_ID,
      planId: PLAN_ID,
      status: 'enabled',
      userConfirmed: true,
      acknowledgedBillingWarning: true,
      acknowledgedBudget: true,
    })).toEqual({ ok: false, reason: 'ad_review_in_progress' })
    expect(provider.setCampaignStatus).not.toHaveBeenCalled()
  })

  it('does not enable when a payment or budget acknowledgement is missing', async () => {
    const { service, provider } = setup({ plan: plan({ status: 'published', external_campaign_id: '456789' }) })

    expect(await service.updateCampaignStatus({
      userId: USER_ID,
      planId: PLAN_ID,
      status: 'enabled',
      userConfirmed: true,
    })).toEqual({ ok: false, reason: 'confirmation_required' })
    expect(provider.getAdReviewStatus).not.toHaveBeenCalled()
    expect(provider.setCampaignStatus).not.toHaveBeenCalled()
  })

  it('rejects old approved plan versions before accessing Google', async () => {
    const { service, deps, provider } = setup({ plan: plan({ version: 2, approved_version: 2 }) })

    expect(await service.publish(confirmedPublish)).toMatchObject({ ok: false, reason: 'plan_changed' })
    expect(deps.withAccess).not.toHaveBeenCalled()
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })

  it('returns an existing published result idempotently without a second reservation', async () => {
    const { service, deps, provider } = setup({
      plan: plan({ status: 'published', external_campaign_id: '456789', publish_credit_charged: true }),
    })

    const result = await service.publish(confirmedPublish)

    expect(result).toMatchObject({ ok: true, state: 'published', externalCampaignId: '456789', creditsCharged: 15 })
    expect(deps.beginPublish).not.toHaveBeenCalled()
    expect(provider.publishCampaign).not.toHaveBeenCalled()
  })
})
