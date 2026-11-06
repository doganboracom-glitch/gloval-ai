import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(resolve(process.cwd(), 'scripts/106-ads-google-publish-e2.sql'), 'utf8')
const liveLifecycleSql = readFileSync(resolve(process.cwd(), 'scripts/120-ads-google-campaign-lifecycle.sql'), 'utf8')
const lifecycleSql = readFileSync(resolve(process.cwd(), 'scripts/123-ads-google-remove-budget-cap.sql'), 'utf8')
const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  crons: Array<{ path: string; schedule: string }>
}

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = sql.indexOf('$$;', start)
  return end < 0 ? '' : sql.slice(start, end + 3)
}

describe('Google Ads E2 SQL draft', () => {
  it('is explicitly marked NOT APPLIED, lists live prerequisites, and is transaction-wrapped', () => {
    expect(migrationSql.startsWith('-- REQUIRED PREREQUISITES')).toBe(true)
    expect(migrationSql).toContain('UNAPPLIED DRAFT — NOT APPLIED')
    expect(migrationSql).toContain('scripts/099-ads-google-public-readonly-quotas.sql')
    expect(migrationSql).toContain('begin;')
    expect(migrationSql).toContain('commit;')
  })

  it('keeps 120 as the legacy capped migration and leaves it outside the new upgrade', () => {
    expect(liveLifecycleSql).toContain('p_budget_cap_minor')
    expect(liveLifecycleSql).toContain('p_user_daily_budget_limit_minor')
    expect(lifecycleSql).toContain('UNAPPLIED DRAFT')
    expect(lifecycleSql).not.toMatch(/^\s*(?:begin|commit)\s*;/im)
    expect(lifecycleSql).toContain('ads_begin_google_ads_management_action_v4')
    expect(lifecycleSql).toContain('p_risk_confirmed_amount_minor')
    expect(lifecycleSql).not.toContain('budget_sanity_ceiling_exceeded')
    expect(lifecycleSql).not.toContain('budget_increase_limit_exceeded')
    expect(lifecycleSql).not.toContain('budget_cooldown_active')
  })

  it('keeps the live six-argument read RPC and never recreates the old four-argument overload', () => {
    expect(migrationSql).not.toMatch(/create or replace function public\.ads_reserve_google_api_operation\s*\(/i)
    expect(migrationSql).not.toMatch(/drop function[^;]*ads_reserve_google_api_operation\s*\(uuid,\s*uuid,\s*uuid,\s*text\s*\)/i)
    expect(migrationSql).toContain('ads_reserve_google_api_operation_v2')
    expect(migrationSql).toContain('ads_save_google_ads_connection_with_limit')
  })

  it('preserves ads_plans and ads_actions table grants and closes only the new E2 tables', () => {
    expect(migrationSql).not.toMatch(/revoke all on table public\.ads_(?:plans|actions)/i)
    expect(migrationSql).toContain('revoke all on table public.ads_google_publish_approvals')
    expect(migrationSql).toContain('revoke all on table public.ads_google_publish_credit_reservations')
    expect(migrationSql).toContain('drop trigger if exists ads_actions_guard_trg')
    expect(migrationSql).toContain('create trigger ads_actions_guard_trg')
    expect(migrationSql).not.toContain('create trigger ads_actions_guard_trigger')
  })

  it('uses hardened definer functions with an empty search path', () => {
    const functions = [...migrationSql.matchAll(/create or replace function public\.[\s\S]*?\$\$;/gi)]
    expect(functions.length).toBeGreaterThan(0)
    for (const [definition] of functions) {
      expect(definition.toLowerCase()).toContain('security definer')
      expect(definition.toLowerCase()).toContain("set search_path = ''")
    }
  })

  it('binds approval, EU declaration, version, account, and validation to one immutable plan hash', () => {
    expect(migrationSql).toContain('ads_google_publish_approvals')
    expect(migrationSql).toContain('approval_hash')
    expect(migrationSql).toContain('validation_hash')
    expect(migrationSql).toContain('eu_political_advertising')
    expect(migrationSql).toContain('eu_declaration_confirmed_at')
    expect(migrationSql).toContain('terms_accepted_at')
    expect(migrationSql).toContain('ads_approve_google_ads_plan_e2')
    expect(migrationSql).toContain('ads_record_google_ads_validation_e2')
    expect(migrationSql).toContain('p_expected_version')
  })

  it('reserves publish credits before the request and charges only in the success finalizer', () => {
    const begin = functionBody(migrationSql, 'ads_begin_google_ads_publish_e2')
    const finalize = functionBody(migrationSql, 'ads_finalize_google_ads_publish_e2')
    expect(migrationSql).toContain('ads_google_publish_credit_reservations')
    expect(begin).toContain("'reserved'")
    expect(begin).not.toContain('ads_charge_credits')
    expect(finalize).toContain('public.ads_charge_credits(')
    expect(finalize).toContain("status = 'charged'")
    expect(finalize).toContain("google_campaign_status = 'PAUSED'")
    expect(finalize).toContain('publish_credit_charged = true')
    expect(migrationSql).toContain('ads_release_google_ads_publish_e2')
  })

  it('enforces a per-currency aggregate daily cap without equating it to the campaign cap', () => {
    const approval = functionBody(migrationSql, 'ads_approve_google_ads_plan_e2')
    expect(approval).toContain('p_user_daily_budget_limit_minor < p_daily_budget_minor')
    expect(approval).not.toContain('p_budget_cap_minor > p_user_daily_budget_limit_minor')
    expect(migrationSql).toContain('budget_limit_exceeded')
    expect(migrationSql).toContain('v_cpc_minor')
    expect(migrationSql).toContain('cpc_bid_ceiling_micros')
  })

  it('keeps Google read and write operation quotas separate and includes geo targeting', () => {
    expect(migrationSql).toContain("'ads.mutateAds'")
    expect(migrationSql).toContain("'geoTargetConstants.suggest'")
    expect(migrationSql).toContain('ads_reserve_google_api_operation_v2')
    expect(migrationSql).toContain('p_operation_count')
    expect(migrationSql).toContain('v_user_used + p_operation_count > 100')
    expect(migrationSql).toContain('v_user_used + p_operation_count > 80')
  })

  it('records approved before/after campaign actions and exposes no delete operation', () => {
    expect(migrationSql).toContain('ads_begin_google_ads_campaign_action_e2')
    expect(migrationSql).toContain('ads_finish_google_ads_campaign_action_e2')
    expect(migrationSql).toContain('before_state')
    expect(migrationSql).toContain('after_state')
    expect(migrationSql).toContain('idempotency_key')
    expect(migrationSql).not.toMatch(/google_ads_delete|deleteCampaign/i)
  })

  it('includes stale-publish reconciliation and schedules it every ten minutes', () => {
    expect(migrationSql).toContain('ads_reconcile_stale_google_ads_publishes')
    expect(migrationSql).toContain('for update skip locked')
    expect(migrationSql).toContain('publish_reconciliation_opened')
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/cron/ads-publish-reconcile',
      schedule: '*/10 * * * *',
    })
  })
})

describe('Google Ads uncapped lifecycle SQL draft', () => {
  const functionDefinitions = [...lifecycleSql.matchAll(/create or replace function public\.[\s\S]*?\$\$;/gi)]

  it('drops live budget-limited signatures and idempotently removes budget columns', () => {
    expect(lifecycleSql).toContain('drop function if exists public.ads_approve_google_ads_plan_e2(uuid, uuid, integer, uuid, text, text, integer, integer, integer, text, text, boolean, boolean, jsonb)')
    expect(lifecycleSql).toContain('drop function if exists public.ads_begin_google_ads_publish_e2(uuid, uuid, uuid, integer, uuid, text, integer, integer, bigint, smallint)')
    expect(lifecycleSql).toContain('drop function if exists public.ads_begin_google_ads_management_action_v4(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, integer, boolean, uuid)')
    expect(lifecycleSql).toContain('drop function if exists public.ads_finish_google_ads_management_action_v4(uuid, uuid, text, jsonb, text)')
    expect(lifecycleSql).toContain('alter column daily_budget_minor type bigint')
    expect(lifecycleSql).toContain('drop column if exists budget_cap_minor')
    expect(lifecycleSql).toContain('drop column if exists approval_user_daily_budget_limit_minor')
    expect(lifecycleSql).toContain('drop column if exists user_daily_budget_limit_minor')
    expect(lifecycleSql).not.toContain('p_user_daily_budget_limit_minor <')
    expect(lifecycleSql).not.toContain('v_target_budget > v_plan.budget_cap_minor')
  })

  it('hardens every lifecycle function and grants execute only to service_role', () => {
    expect(functionDefinitions).toHaveLength(7)
    for (const [definition] of functionDefinitions) {
      expect(definition.toLowerCase()).toContain('security definer')
      expect(definition.toLowerCase()).toContain("set search_path = ''")
      expect(definition).not.toMatch(/p_budget_cap_minor|p_user_daily_budget_limit_minor/i)
    }
    expect(lifecycleSql).toMatch(/revoke all on function[\s\S]*?from public, anon, authenticated/i)
    expect(lifecycleSql).toMatch(/grant execute on function[\s\S]*?to service_role/i)
  })
})
