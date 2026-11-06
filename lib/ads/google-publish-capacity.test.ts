import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../scripts/119-google-ads-live-controls.sql', import.meta.url), 'utf8')

describe('Google Ads live-controls SQL draft', () => {
  it('uses versioned publish and approval RPCs with service-role-only access', () => {
    for (const functionName of [
      'ads_approve_google_ads_plan_v2',
      'ads_begin_google_ads_publish_v2',
      'ads_begin_google_ads_campaign_action_v2',
      'ads_reserve_google_ads_publish_capacity_v2',
      'ads_finish_google_ads_publish_capacity_v2',
    ]) {
      expect(sql).toContain(`public.${functionName}`)
    }
    expect(sql.match(/security definer/g)).toHaveLength(6)
    expect(sql.match(/set search_path = ''/g)).toHaveLength(6)
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain('to service_role')
  })

  it('allows unlimited global attempts and has no campaign-count gate', () => {
    expect(sql).toContain('p_daily_attempts_global is not null')
    expect(sql).not.toContain('p_max_active_campaigns_per_user')
    expect(sql).not.toContain('google_ads_campaign_enable_capacity_reserved')
    expect(sql).not.toMatch(/between\s+1\s+and\s+(100|5000)/i)
  })

  it('treats the aggregate spend ceiling as optional while preserving an optional per-campaign safety ceiling', () => {
    expect(sql).toContain('alter column user_daily_budget_limit_minor drop not null')
    expect(sql).toContain('p_user_daily_budget_limit_minor is not null')
    expect(sql).toContain('budget_limit_exceeded')
    expect(sql).not.toContain('GOOGLE_ADS_PUBLISH_DAILY_BUDGET_CAPS_MINOR')
  })

  it('uses idempotent reservations and emits bounded policy reasons without tokens', () => {
    expect(sql).toContain("a.idempotency_key = p_request_id")
    expect(sql).toContain("'google_ads_publish_attempt_reserved_v2'")
    expect(sql).toContain("'google_ads_policy_blocked'")
    expect(sql).toContain("'reason_code', v_denial")
    expect(sql).not.toContain('refresh_token')
    expect(sql).not.toContain('access_token')
  })
})
