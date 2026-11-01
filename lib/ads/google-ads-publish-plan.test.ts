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

const INPUT = {
  customerId: '1234567890',
  planJson: PLAN,
  requestId: '123e4567-e89b-42d3-a456-426614174002',
  dailyBudgetMinor: 15000,
  budgetCapMinor: 90000,
  currency: 'TRY',
  validateOnly: false,
}

describe('Google Ads publish plan compiler', () => {
  it('builds only server-generated operations from validated plan JSON and creates the campaign paused', () => {
    const request = buildGoogleAdsMutateRequest(INPUT)
    const campaignOperation = request.mutateOperations.find((operation) => 'campaignOperation' in operation)
    const budgetOperation = request.mutateOperations.find((operation) => 'campaignBudgetOperation' in operation)

    expect(request).toMatchObject({ partialFailure: false, validateOnly: false })
    expect(request.mutateOperations).toHaveLength(10)
    const campaign = (campaignOperation?.campaignOperation as {
      create: { status: string; campaignBudget: string; maximizeClicks: { cpcBidCeilingMicros: string }; name: string }
    }).create
    expect(campaign).toMatchObject({
      status: 'PAUSED',
      campaignBudget: 'customers/1234567890/campaignBudgets/-1',
      maximizeClicks: { cpcBidCeilingMicros: '15000000' },
    })
    expect(campaign.name).toContain('req-123e4567e89b42d3')
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
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 15000, budgetCapMinor: 90000 }))
      .toMatchObject({ cpcBidCeilingMinor: 1500, cpcBidCeilingMicros: '15000000', currencyFractionDigits: 2 })
    expect(buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 500, budgetCapMinor: 500 }))
      .toMatchObject({ cpcBidCeilingMinor: 100, cpcBidCeilingMicros: '1000000' })
    expect(buildGoogleAdsApprovalSummary({ currency: 'JPY', dailyBudgetMinor: 100, budgetCapMinor: 500 }))
      .toMatchObject({ cpcBidCeilingMinor: 10, cpcBidCeilingMicros: '10000000', currencyFractionDigits: 0 })
    expect(() => buildGoogleAdsApprovalSummary({ currency: 'TRY', dailyBudgetMinor: 50, budgetCapMinor: 100 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_budget' }))
  })

  it('passes validate_only through to the generated mutate request', () => {
    expect(buildGoogleAdsMutateRequest({ ...INPUT, validateOnly: true }).validateOnly).toBe(true)
  })

  it('rejects incomplete, policy-blocked, or unsafe plan JSON before creating a body', () => {
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, adCopy: { ...PLAN.adCopy, headlines: ['Only one'] } } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, modelPolicyEvidence: 'explicit' } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, planJson: { ...PLAN, finalUrl: 'http://gloval.example/' } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_publish_plan' }))
  })

  it('rejects a daily budget above the approved plan cap', () => {
    expect(() => buildGoogleAdsMutateRequest({ ...INPUT, dailyBudgetMinor: 100000 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_budget' }))
  })
})
