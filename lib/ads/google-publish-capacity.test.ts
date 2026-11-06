import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../scripts/119-google-ads-live-controls.sql', import.meta.url), 'utf8')

describe('Google Ads live-controls SQL draft', () => {
  it('serializes global and per-user reservations and enforces publish caps atomically', () => {
    expect(sql).toContain("hashtextextended('google-ads-publish-global', 0)")
    expect(sql).toContain("hashtextextended('google-ads-publish-user:' || p_user_id::text, 0)")
    expect(sql).toContain('v_active_campaigns >= p_max_active_campaigns_per_user')
    expect(sql).toContain('v_user_attempts >= p_daily_attempts_per_user')
    expect(sql).toContain('v_global_attempts >= p_daily_attempts_global')
    expect(sql).toContain("p.google_campaign_status in ('ENABLED', 'PAUSED')")
    expect(sql).toContain('ads_reserve_google_ads_campaign_enable_capacity')
    expect(sql).toContain("'google_ads_campaign_enable_capacity_reserved'")
  })

  it('makes publish attempts idempotent and keeps RPC execution service-role-only', () => {
    expect(sql).toContain("a.idempotency_key = p_request_id")
    expect(sql).toContain("'google_ads_publish_attempt_reserved'")
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain('to service_role')
  })

  it('records bounded reason codes without storing account or ad payloads', () => {
    expect(sql).toContain("'google_ads_policy_blocked'")
    expect(sql).toContain("'reason_code', v_denial")
    expect(sql).not.toContain('refresh_token')
    expect(sql).not.toContain('access_token')
  })
})
