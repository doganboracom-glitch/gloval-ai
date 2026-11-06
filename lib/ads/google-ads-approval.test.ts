import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createGoogleAdsActionApprovalHash,
  createGoogleAdsPlanApprovalHash,
  hashGoogleAdsApprovalPayload,
} from '@/lib/ads/google-ads-approval'

const planInput = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  planId: '123e4567-e89b-42d3-a456-426614174001',
  planVersion: 4,
  connectionId: '123e4567-e89b-42d3-a456-426614174000',
  customerId: '1234567890',
  currency: 'TRY',
  dailyBudgetMinor: 15000,
  plan: { name: 'Search', keywords: ['site', 'design'] },
}

describe('Google Ads approval fingerprints', () => {
  it('canonicalizes object key order and is stable for the same approval payload', () => {
    expect(hashGoogleAdsApprovalPayload({ a: 1, nested: { z: true, b: 'value' } }))
      .toBe(hashGoogleAdsApprovalPayload({ nested: { b: 'value', z: true }, a: 1 }))
    expect(createGoogleAdsPlanApprovalHash(planInput)).toBe(createGoogleAdsPlanApprovalHash(planInput))
  })

  it('binds an approval to version, account, budget, declaration, and plan content', () => {
    const baseline = createGoogleAdsPlanApprovalHash(planInput)
    expect(createGoogleAdsPlanApprovalHash({ ...planInput, planVersion: 5 })).not.toBe(baseline)
    expect(createGoogleAdsPlanApprovalHash({ ...planInput, customerId: '9876543210' })).not.toBe(baseline)
    expect(createGoogleAdsPlanApprovalHash({ ...planInput, dailyBudgetMinor: 15001 })).not.toBe(baseline)
    expect(createGoogleAdsPlanApprovalHash({ ...planInput, plan: { name: 'Search', keywords: ['changed'] } })).not.toBe(baseline)
  })

  it('binds a management approval to the exact before and requested states', () => {
    const action = {
      userId: planInput.userId,
      planId: planInput.planId,
      planVersion: planInput.planVersion,
      connectionId: planInput.connectionId,
      customerId: planInput.customerId,
      action: 'budget' as const,
      before: { dailyBudgetMinor: 15000 },
      target: { dailyBudgetMinor: 20000 },
    }
    const baseline = createGoogleAdsActionApprovalHash(action)
    expect(createGoogleAdsActionApprovalHash({ ...action, target: { dailyBudgetMinor: 22000 } })).not.toBe(baseline)
  })
})
