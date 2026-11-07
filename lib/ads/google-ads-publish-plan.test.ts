import { describe, expect, it } from 'vitest'
import {
  buildGoogleAdsApprovalSummary,
  buildGoogleAdsMutateRequest,
} from '@/lib/ads/google-ads-publish-plan'

const PLAN = {
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
  cities: [],
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

const INPUT = {
  customerId: '1234567890',
  planJson: PLAN,
  requestId: '123e4567-e89b-42d3-a456-426614174002',
  dailyBudgetMinor: 15000,
  currency: 'TRY',
  validateOnly: false,
}

describe('Google Ads publish plan compiler', () => {
  it('builds only server-generated operations from validated plan JSON and creates the campaign paused', () => {
    const request = buildGoogleAdsMutateRequest(INPUT)
    const campaignOperation = request.mutateOperations.find((operation) => 'campaignOperation' in operation)
    const budgetOperation = request.mutateOperations.find((operation) => 'campaignBudgetOperation' in operation)

    expect(request).toMatchObject({ partialFailure: false, validateOnly: false })
    expect(request.mutateOperations).toHaveLength(12)
    const campaign = (campaignOperation?.campaignOperation as {
      create: { status: string; campaignBudget: string; targetSpend: { cpcBidCeilingMicros: string }; name: string }
    }).create
    expect(campaign).toMatchObject({
      status: 'PAUSED',
      campaignBudget: 'customers/1234567890/campaignBudgets/-1',
      targetSpend: { cpcBidCeilingMicros: '15000000' },
    })
    expect(campaign.name).not.toContain('req-')
    expect(request.mutateOperations).toContainEqual({
      labelOperation: { create: { resourceName: 'customers/1234567890/labels/-4', name: 'gloval-req-123e4567e89b42d3' } },
    })
    expect(request.mutateOperations).toContainEqual({
      campaignLabelOperation: {
        create: { campaign: 'customers/1234567890/campaigns/-2', label: 'customers/1234567890/labels/-4' },
      },
    })
    const labelIndex = request.mutateOperations.findIndex((operation) => 'labelOperation' in operation)
    const campaignIndex = request.mutateOperations.findIndex((operation) => 'campaignOperation' in operation)
    const campaignLabelIndex = request.mutateOperations.findIndex((operation) => 'campaignLabelOperation' in operation)
    expect(labelIndex).toBeLessThan(campaignLabelIndex)
    expect(campaignIndex).toBeLessThan(campaignLabelIndex)
    expect((budgetOperation?.campaignBudgetOperation as { create: { name: string } }).create.name).toContain('req-123e4567e89b42d3')
    const locationCriteria = request.mutateOperations.filter((operation) =>
      'campaignCriterionOperation' in operation &&
      Boolean((operation.campaignCriterionOperation as { create?: { location?: unknown } }).create?.location),
    )
    expect(locationCriteria).toHaveLength(1)
    expect(locationCriteria[0]).toMatchObject({
      campaignCriterionOperation: { create: { location: { geoTargetConstant: 'geoTargetConstants/2792' } } },
    })
    expect((budgetOperation?.campaignBudgetOperation as { create: { amountMicros: string } }).create.amountMicros)
      .toBe('150000000')
    expect(request.mutateOperations).toContainEqual(expect.objectContaining({
      campaignCriterionOperation: expect.objectContaining({
        create: expect.objectContaining({ language: { languageConstant: 'languageConstants/1037' } }),
      }),
    }))
    expect(request).not.toHaveProperty('campaign')
  })

  it('uses the official English language constant when the plan language is English', () => {
    const request = buildGoogleAdsMutateRequest({
      ...INPUT,
      planJson: { ...PLAN, language: 'en' },
    })

    expect(request.mutateOperations).toContainEqual(expect.objectContaining({
      campaignCriterionOperation: expect.objectContaining({
        create: expect.objectContaining({ language: { languageConstant: 'languageConstants/1000' } }),
      }),
    }))
  })

  it('calculates and rounds the Maximize Clicks CPC cap in the currency minor unit', () => {
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 15000 }))
      .toMatchObject({ cpcBidCeilingMinor: 1500, cpcBidCeilingMicros: '15000000', currencyFractionDigits: 2 })
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 500 }))
      .toMatchObject({ cpcBidCeilingMinor: 50, cpcBidCeilingMicros: '500000' })
    expect(buildGoogleAdsApprovalSummary({ currency: 'JPY', dailyBudgetMinor: 100 }))
      .toMatchObject({ cpcBidCeilingMinor: 10, cpcBidCeilingMicros: '10000000', currencyFractionDigits: 0 })
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 50 }))
      .toMatchObject({ cpcBidCeilingMinor: 5, cpcBidCeilingMicros: '50000' })
    expect(() => buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 0 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_budget' }))
  })

  it('passes validate_only through to the generated mutate request', () => {
    expect(buildGoogleAdsMutateRequest({ ...INPUT, validateOnly: true }).validateOnly).toBe(true)
  })

  it('caps a maximal publish and maps only the explicitly confirmed EU political declaration', () => {
    const planJson = {
      ...PLAN,
      keywords: Array.from({ length: 20 }, (_, index) => `keyword phrase ${index + 1}`),
      negativeKeywords: Array.from({ length: 8 }, (_, index) => `negative phrase ${index + 1}`),
    }
    const request = buildGoogleAdsMutateRequest({ ...INPUT, planJson })
    const campaignOperation = request.mutateOperations.find((operation) => 'campaignOperation' in operation)

    expect(request.mutateOperations).toHaveLength(36)
    expect((campaignOperation?.campaignOperation as { create: Record<string, unknown> }).create)
      .toHaveProperty('containsEuPoliticalAdvertising', 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING')
    expect((campaignOperation?.campaignOperation as { create: Record<string, unknown> }).create)
      .not.toHaveProperty('contains_eu_political_advertising')
  })

  it('rejects a political advertising answer without explicit user confirmation', () => {
    expect(() => buildGoogleAdsMutateRequest({
      ...INPUT,
      planJson: { ...PLAN, euPoliticalDeclarationConfirmed: false },
    })).toThrowError(expect.objectContaining({ code: 'eu_political_declaration_required' }))
  })

  it('rejects incomplete, policy-blocked, or unsafe plan JSON before creating a body', () => {
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, adCopy: { ...PLAN.adCopy, headlines: ['Only one'] } } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, modelPolicyEvidence: 'explicit' } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, finalUrl: 'http://gloval.example/' } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
  })

  it('does not cap a valid daily budget at the old plan reference amount', () => {
    const request = buildGoogleAdsMutateRequest({ ...INPUT, dailyBudgetMinor: 100000 })
    const budgetOperation = request.mutateOperations.find((operation) => 'campaignBudgetOperation' in operation)
    expect((budgetOperation?.campaignBudgetOperation as { create: { amountMicros: string } }).create.amountMicros)
      .toBe('1000000000')
  })
})
