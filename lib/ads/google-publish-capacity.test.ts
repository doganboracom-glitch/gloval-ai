import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL('../../scripts/124-google-ads-publish-capacity.sql', import.meta.url), 'utf8')

function functionBody(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = sql.indexOf('$$;', start)
  return end < 0 ? '' : sql.slice(start, end + 3)
}

describe('Google Ads publish-capacity SQL draft', () => {
  it('is draft-only, transactional and defines only the capacity RPCs', () => {
    expect(sql.startsWith('-- DRAFT ONLY')).toBe(true)
    expect(sql).toContain('has not been run against the live database')
    expect(sql).toMatch(/^\s*begin\s*;/im)
    expect(sql).toMatch(/^\s*commit\s*;/im)
    const definitions = [...sql.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1])
    expect(definitions).toEqual([
      'ads_reserve_google_ads_publish_capacity_v2',
      'ads_finish_google_ads_publish_capacity_v2',
    ])
  })

  it('hardens both RPCs and limits execution to service_role', () => {
    expect(sql.match(/security definer/g)).toHaveLength(2)
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2)
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain('to service_role')
  })

  it('keeps per-user protection on and treats a null global limit as unlimited', () => {
    const reserve = functionBody('ads_reserve_google_ads_publish_capacity_v2')
    expect(reserve).toContain('coalesce(p_daily_attempts_per_user, 30)')
    expect(reserve).toContain('p_daily_attempts_global is not null')
    expect(reserve).toContain("interval '24 hours'")
    expect(reserve).not.toMatch(/between\s+1\s+and\s+(100|5000)/i)
    expect(sql).not.toContain('p_max_active_campaigns_per_user')
    expect(sql).not.toContain('google_ads_campaign_enable_capacity_reserved')
  })

  it('does not reference removed budget-cap columns or old RPC signatures', () => {
    expect(sql).not.toContain('budget_cap_minor')
    expect(sql).not.toContain('user_daily_budget_limit_minor')
    expect(sql).not.toContain('GOOGLE_ADS_PUBLISH_DAILY_BUDGET_CAPS_MINOR')
    expect(sql).not.toMatch(/ads_(approve|begin)_google_ads_[a-z_]*_v2/)
  })

  it('uses idempotent reservations and emits bounded policy reasons without tokens', () => {
    expect(sql).toContain('a.idempotency_key = p_request_id')
    expect(sql).toContain("'google_ads_publish_attempt_reserved_v2'")
    expect(sql).toContain("'google_ads_policy_blocked'")
    expect(sql).toContain("'reason_code', v_denial")
    expect(sql).not.toContain('refresh_token')
    expect(sql).not.toContain('access_token')
  })
})
