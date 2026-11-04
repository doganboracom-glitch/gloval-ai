import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createGoogleAdsActionApprovalHash } from '@/lib/ads/google-ads-approval'

describe('Google Ads action approval hashes', () => {
  it('changes when the baseline state changes', () => {
    const input = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      planId: '123e4567-e89b-42d3-a456-426614174001',
      planVersion: 3,
      connectionId: '123e4567-e89b-42d3-a456-426614174000',
      customerId: '1234567890',
      action: 'pause' as const,
      before: { status: 'ENABLED' },
      target: { status: 'PAUSED' },
    }
    expect(createGoogleAdsActionApprovalHash({ ...input, before: { status: 'PAUSED' } }))
      .not.toBe(createGoogleAdsActionApprovalHash(input))
  })
})
