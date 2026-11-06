import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(resolve(process.cwd(), 'scripts/119-google-ads-live-controls.sql'), 'utf8')

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = sql.indexOf('$$;', start)
  return end < 0 ? '' : sql.slice(start, end + 3)
}

const v2Functions = [
  'ads_approve_google_ads_plan_v2',
  'ads_begin_google_ads_publish_v2',
  'ads_begin_google_ads_campaign_action_v2',
  'ads_finish_google_ads_campaign_action_v2',
  'ads_reserve_google_ads_publish_capacity_v2',
  'ads_finish_google_ads_publish_capacity_v2',
]

describe('Google Ads live-controls SQL draft', () => {
  it('is clearly draft-only and does not apply itself', () => {
    expect(migrationSql.startsWith('-- DRAFT ONLY')).toBe(true)
    expect(migrationSql).toContain('has not been run against the live database')
    expect(migrationSql).not.toMatch(/^\s*(?:begin|commit)\s*;/im)
  })

  it('uses v2 RPC names with hardened service-role-only execution', () => {
    for (const name of v2Functions) expect(migrationSql).toContain(`function public.${name}(`)
    const functions = [...migrationSql.matchAll(/create or replace function public\.[\s\S]*?\$\$;/gi)]
    expect(functions).toHaveLength(v2Functions.length)
    for (const [definition] of functions) {
      expect(definition.toLowerCase()).toContain('security definer')
      expect(definition.toLowerCase()).toContain("set search_path = ''")
    }
    expect(migrationSql).toContain('to service_role')
    expect(migrationSql).toContain('from public, anon, authenticated')
  })

  it('allows nullable budget ceilings and removes aggregate user-budget enforcement', () => {
    const approval = functionBody(migrationSql, 'ads_approve_google_ads_plan_v2')
    const publish = functionBody(migrationSql, 'ads_begin_google_ads_publish_v2')
    const management = functionBody(migrationSql, 'ads_begin_google_ads_campaign_action_v2')
    expect(migrationSql).toContain('alter column user_daily_budget_limit_minor drop not null')
    expect(approval).toContain('p_user_daily_budget_limit_minor is not null')
    expect(publish).toContain('p_user_daily_budget_limit_minor is not null')
    expect(management).toContain('p_user_daily_budget_limit_minor is not null')
    expect(approval).not.toContain('select coalesce(sum(coalesce(p.google_daily_budget_minor')
    expect(publish).not.toContain('v_reserved + v_plan.daily_budget_minor')
    expect(management).not.toContain('select coalesce(sum(coalesce(p.google_daily_budget_minor')
  })

  it('defaults to per-user attempt protection while null limits mean unlimited', () => {
    const reserve = functionBody(migrationSql, 'ads_reserve_google_ads_publish_capacity_v2')
    expect(reserve).toContain('p_daily_attempts_per_user is not null')
    expect(reserve).toContain('p_daily_attempts_global is not null')
    expect(reserve).toContain("interval '24 hours'")
    expect(reserve).not.toMatch(/between\s+1\s+and\s+(100|5000)/i)
    expect(reserve).not.toContain('google_campaign_status')
    expect(migrationSql).not.toContain('ads_reserve_google_ads_campaign_enable_capacity')
  })

  it('does not impose a campaign-count ceiling and keeps campaign edits auditable', () => {
    const action = functionBody(migrationSql, 'ads_begin_google_ads_campaign_action_v2')
    expect(action).toContain('before_state')
    expect(action).toContain('after_state')
    expect(action).toContain('idempotency_key')
    expect(action).not.toContain('google_campaign_status')
    expect(action).not.toContain('max_active_campaigns')
  })

  it('keeps the 15-credit charge on successful publish finalization only', () => {
    const begin = functionBody(migrationSql, 'ads_begin_google_ads_publish_v2')
    expect(begin).toContain("status = 'reserved'")
    expect(begin).not.toContain('ads_charge_credits')
    expect(begin).toContain('daily_budget_minor > p_user_daily_budget_limit_minor')
    expect(migrationSql).toContain('alter column user_daily_budget_limit_minor drop not null')
  })
})
