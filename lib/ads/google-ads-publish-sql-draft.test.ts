import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sqlDraft = readFileSync(resolve(process.cwd(), 'scripts/094-ads-google-publish.sql'), 'utf8')
const vercelConfig = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')

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

  it('binds the reservation to the exact approved version and stores the CPC summary', () => {
    expect(sqlDraft).toContain('approved_version')
    expect(sqlDraft).toContain('p_expected_version')
    expect(sqlDraft).toContain("'plan_changed'")
    expect(sqlDraft).toContain('for update')
    expect(sqlDraft).toContain('approval_summary')
    expect(sqlDraft).toContain('cpcBidCeilingMicros')
  })

  it('counts separate user and project read/write buckets while counting every mutate operation', () => {
    expect(sqlDraft).toContain("'googleAds.mutate'")
    expect(sqlDraft).toContain('p_operation_count')
    expect(sqlDraft).toContain('sum(o.operation_count)')
    expect(sqlDraft).toContain('v_user_used + 1 > 80')
    expect(sqlDraft).toContain('v_user_used + p_operation_count > 100')
    expect(sqlDraft).toContain('v_global_bucket_used + 1 > 1200')
    expect(sqlDraft).toContain('v_global_bucket_used + p_operation_count > 1200')
    expect(sqlDraft).toContain('emits 34 mutate')
    expect(sqlDraft).toContain('ads_reserve_google_api_operation_v2')
  })

  it('atomically charges 15 credits when a plan enters publishing', () => {
    expect(sqlDraft).toContain('ads_begin_google_ads_publish')
    expect(sqlDraft).toContain('public.ads_charge_credits(')
    expect(sqlDraft).toContain('p_user_id,\n    15,')
  })

  it('keeps reconciliation on plans and restricts manual resolution to service_role', () => {
    expect(sqlDraft).toContain('ads_resolve_google_ads_publish')
    expect(sqlDraft).toContain("'failed_refunded'")
    expect(sqlDraft).toContain('grant execute on function public.ads_resolve_google_ads_publish')
    expect(sqlDraft).not.toContain('create table public.ads_google_publish_recoveries')
  })

  it('scans stale publishing rows with row locks and adds the opened audit action', () => {
    expect(sqlDraft).toContain('ads_reconcile_stale_google_ads_publishes')
    expect(sqlDraft).toContain('publish_started_at < pg_catalog.clock_timestamp() - interval \'10 minutes\'')
    expect(sqlDraft.toLowerCase()).toContain('for update skip locked')
    expect(sqlDraft).toContain("'publish_reconciliation_opened'")
    expect(sqlDraft).toContain('grant execute on function public.ads_reconcile_stale_google_ads_publishes(integer)')
  })

  it('adds the cron route without scheduling it in vercel.json', () => {
    expect(vercelConfig).not.toContain('/api/cron/ads-publish-reconcile')
  })
})
