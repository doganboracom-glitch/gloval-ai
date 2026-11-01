import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sqlDraft = readFileSync(resolve(process.cwd(), 'scripts/094-ads-google-publish.sql'), 'utf8')

describe('Google Ads publish SQL draft', () => {
  it('is explicitly marked as a review-only draft', () => {
    expect(sqlDraft.startsWith('-- UNAPPLIED DRAFT')).toBe(true)
    expect(sqlDraft).toContain('Do not run until reviewed and approved')
  })

  it('records reconciling state and billing verification without enabling campaign publishing', () => {
    expect(sqlDraft).toContain("'publishing'")
    expect(sqlDraft).toContain("'reconciling'")
    expect(sqlDraft).toContain('publish_billing_verified')
    expect(sqlDraft).toContain('google_campaign_status')
  })

  it('allowlists mutate and counts every operation for both read and mutate quota checks', () => {
    expect(sqlDraft).toContain("'googleAds.mutate'")
    expect(sqlDraft).toContain('p_operation_count')
    expect(sqlDraft).toContain('sum(o.operation_count)')
    expect(sqlDraft).toContain('ads_reserve_google_api_operation_v2')
  })

  it('atomically charges 15 credits when a plan enters publishing', () => {
    expect(sqlDraft).toContain('ads_begin_google_ads_publish')
    expect(sqlDraft).toContain('public.ads_charge_credits(p_user_id, 15,')
  })
})
