import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const e1Sql = readFileSync(resolve(process.cwd(), 'scripts/094-ads-google-publish.sql'), 'utf8')
const e2Sql = readFileSync(resolve(process.cwd(), 'scripts/095-ads-google-publish-e2.sql'), 'utf8')
const vercelConfig = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = sql.indexOf('$$;', start)
  return end < 0 ? '' : sql.slice(start, end + 3)
}

describe('Google Ads E2 SQL draft', () => {
  it('is explicitly marked NOT APPLIED and never executes against the connected database', () => {
    expect(e2Sql.startsWith('-- UNAPPLIED DRAFT')).toBe(true)
    expect(e2Sql).toContain('Do not run until reviewed and explicitly approved')
    expect(e2Sql).toContain('begin;')
    expect(e2Sql).toContain('commit;')
  })

  it('binds approval, EU declaration, version, account, and validation to one immutable plan hash', () => {
    expect(e2Sql).toContain('ads_google_publish_approvals')
    expect(e2Sql).toContain('approval_hash')
    expect(e2Sql).toContain('validation_hash')
    expect(e2Sql).toContain('eu_political_advertising')
    expect(e2Sql).toContain('eu_declaration_confirmed_at')
    expect(e2Sql).toContain('terms_accepted_at')
    expect(e2Sql).toContain('ads_approve_google_ads_plan_e2')
    expect(e2Sql).toContain('ads_record_google_ads_validation_e2')
    expect(e2Sql).toContain('p_expected_version')
  })

  it('reserves publish credits before the request and charges only in the success finalizer', () => {
    const begin = functionBody(e2Sql, 'ads_begin_google_ads_publish_e2')
    const finalize = functionBody(e2Sql, 'ads_finalize_google_ads_publish_e2')
    expect(e2Sql).toContain('ads_google_publish_credit_reservations')
    expect(begin).toContain("'reserved'")
    expect(begin).not.toContain('ads_charge_credits')
    expect(finalize).toContain('public.ads_charge_credits(')
    expect(finalize).toContain("status = 'charged'")
    expect(finalize).toContain("google_campaign_status = 'PAUSED'")
    expect(finalize).toContain('publish_credit_charged = true')
    expect(e2Sql).toContain('ads_release_google_ads_publish_e2')
  })

  it('enforces a per-currency aggregate daily cap and the server-side CPC ceiling', () => {
    expect(e2Sql).toContain('p_user_daily_budget_limit_minor')
    expect(e2Sql).toContain('budget_limit_exceeded')
    expect(e2Sql).toContain('v_cpc_minor')
    expect(e2Sql).toContain('cpc_bid_ceiling_micros')
  })

  it('keeps Google read and write operation quotas separate and includes geo targeting', () => {
    expect(e2Sql).toContain("'ads.mutateAds'")
    expect(e2Sql).toContain("'geoTargetConstants.suggest'")
    expect(e2Sql).toContain('ads_reserve_google_api_operation_v2')
    expect(e2Sql).toContain('p_operation_count')
    expect(e2Sql).toContain('v_user_used + p_operation_count > 100')
    expect(e2Sql).toContain('v_user_used + p_operation_count > 80')
  })

  it('records approved before/after campaign actions and exposes no delete operation', () => {
    expect(e2Sql).toContain('ads_begin_google_ads_campaign_action_e2')
    expect(e2Sql).toContain('ads_finish_google_ads_campaign_action_e2')
    expect(e2Sql).toContain('before_state')
    expect(e2Sql).toContain('after_state')
    expect(e2Sql).toContain('idempotency_key')
    expect(e2Sql).not.toMatch(/google_ads_delete|deleteCampaign/i)
  })

  it('keeps the E1 stale-publish reconciliation draft and does not schedule a new cron job', () => {
    expect(e1Sql).toContain('ads_reconcile_stale_google_ads_publishes')
    expect(e1Sql).toContain('for update skip locked')
    expect(e1Sql).toContain('publish_reconciliation_opened')
    expect(vercelConfig).not.toContain('/api/cron/ads-publish-reconcile')
  })
})
