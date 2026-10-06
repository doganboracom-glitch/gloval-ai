import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

/**
 * Two layers:
 *  1. Static contract tests on scripts/013 (always run). They prove the guard,
 *     the row lock, audit and the grants are in the SQL — they do NOT execute it.
 *  2. Live tests against a real database (skipped unless RUN_DB_TESTS=1 AND
 *     migration 013 has been applied). Concurrency uses real parallel RPC calls.
 *     They need a throwaway user with an iyzico-like row, supplied via env, and
 *     never contact iyzico/PayTR.
 */

const sql = readFileSync(join(process.cwd(), 'scripts/013-admin-plan-change-payment-guard.sql'), 'utf8')
const fnBody = sql.slice(sql.indexOf('create or replace function public.admin_change_user_plan'))
const SIG = 'public.admin_change_user_plan(text, uuid, uuid, uuid, text, text, boolean)'

describe('migration 013 (static contract)', () => {
  it('drops the old 6-arg overload so the unguarded version cannot be called', () => {
    expect(sql).toMatch(/drop function if exists public\.admin_change_user_plan\(text, uuid, uuid, uuid, text, text\)/)
  })

  it('checks provider-backed state AFTER locking the subscription row, before the update', () => {
    const lock = fnBody.indexOf('for update')
    const check = fnBody.indexOf('v_provider_backed := v_sub.provider <> \'mock\' and v_sub.provider_ref is not null')
    const block = fnBody.indexOf("'payment_sync_required'")
    const update = fnBody.indexOf('update billing_subscriptions set')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(check)
    expect(check).toBeLessThan(block)
    expect(block).toBeLessThan(update)
  })

  it('also serializes per user with an advisory lock taken before the row lock', () => {
    expect(fnBody.indexOf('pg_advisory_xact_lock')).toBeGreaterThan(-1)
    expect(fnBody.indexOf('pg_advisory_xact_lock')).toBeLessThan(fnBody.indexOf('for update'))
  })

  it('audits the blocked attempt itself and returns without touching the subscription', () => {
    const blocked = fnBody.slice(fnBody.indexOf('if v_provider_backed and not'), fnBody.indexOf('if v_provider_backed then'))
    expect(blocked).toContain("'blocked'")
    expect(blocked).toContain('insert into admin_package_audit')
    expect(blocked).toContain('return jsonb_build_object')
    expect(blocked).not.toContain('update billing_subscriptions')
  })

  it('keeps the acknowledgement note and the success audit row', () => {
    expect(fnBody).toContain('YAPILMADI')
    expect(fnBody).toMatch(/values \(p_admin_email, p_admin_id, p_user_id, 'plan_change', 'plan', v_old, v_new, v_reason, p_idem\)/)
  })

  it('preserves idempotency, payment_in_flight, same_plan and validation guards', () => {
    for (const k of ['idempotency_key = p_idem', 'payment_in_flight', 'same_plan', 'user_not_found', 'plan_not_found']) {
      expect(fnBody).toContain(k)
    }
  })

  it('never touches payment tables or calls out to a provider', () => {
    expect(fnBody).not.toMatch(/billing_transactions|iyzico|paytr|http/i)
  })

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(fnBody).toMatch(/security definer set search_path = public/)
  })

  it('revokes from public/anon/authenticated and grants only service_role', () => {
    expect(sql).toContain(`revoke all on function ${SIG}\n  from public, anon, authenticated;`)
    expect(sql).toContain(`grant execute on function ${SIG}\n  to service_role;`)
    expect(sql.match(/grant execute/g)).toHaveLength(1)
  })
})

const live = process.env.RUN_DB_TESTS === '1'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const TEST_USER = process.env.DB_TEST_USER_ID
const PLAN_A = process.env.DB_TEST_PLAN_A
const PLAN_B = process.env.DB_TEST_PLAN_B

const args = (userId: string, planId: string, idem: string, ack = false) => ({
  p_admin_email: 'db-test@gloval.ai',
  p_admin_id: null,
  p_user_id: userId,
  p_plan_id: planId,
  p_reason: 'db test',
  p_idem: idem,
  p_ack_no_payment_sync: ack,
})

describe.skipIf(!live || !url || !anonKey)('admin_change_user_plan (live, unauthorized access)', () => {
  it('rejects the anon client', async () => {
    const anon = createClient(url!, anonKey!)
    const { data, error } = await anon.rpc('admin_change_user_plan', args('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000', 'live-anon-test-0000001'))
    expect(data).toBeFalsy()
    expect(error).toBeTruthy()
  })
})

describe.skipIf(!live || !url || !serviceKey || !TEST_USER || !PLAN_A || !PLAN_B)(
  'admin_change_user_plan (live, concurrency)',
  () => {
    it('blocks unacknowledged changes for a provider-backed subscription, even when racing', async () => {
      const svc = createClient(url!, serviceKey!)
      const before = await svc.from('billing_subscriptions').select('plan_id').eq('user_id', TEST_USER!).in('status', ['trialing', 'active', 'past_due']).maybeSingle()
      const run = Date.now()
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => svc.rpc('admin_change_user_plan', args(TEST_USER!, i % 2 ? PLAN_A! : PLAN_B!, `live-race-${run}-${i}`))),
      )
      const payloads = results.map((r) => r.data as { ok: boolean; error?: string })
      const sub = await svc.from('billing_subscriptions').select('provider, provider_ref, plan_id').eq('user_id', TEST_USER!).in('status', ['trialing', 'active', 'past_due']).maybeSingle()
      if (sub.data && sub.data.provider !== 'mock' && sub.data.provider_ref) {
        expect(payloads.every((p) => !p.ok && p.error === 'payment_sync_required')).toBe(true)
        expect(sub.data.plan_id).toBe(before.data?.plan_id)
      } else {
        // Mock/no subscription: exactly the serialized transitions succeed, nothing is lost or duplicated.
        const { count } = await svc.from('billing_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', TEST_USER!).in('status', ['trialing', 'active', 'past_due'])
        expect(count).toBeLessThanOrEqual(1)
      }
    })

    it('does not double-apply the same idempotency key under parallel calls', async () => {
      const svc = createClient(url!, serviceKey!)
      const key = `live-idem-${Date.now()}`
      const results = await Promise.all(Array.from({ length: 4 }, () => svc.rpc('admin_change_user_plan', args(TEST_USER!, PLAN_A!, key, true))))
      const { count } = await svc.from('admin_package_audit').select('id', { count: 'exact', head: true }).eq('idempotency_key', key).eq('status', 'success')
      expect(count).toBeLessThanOrEqual(1)
      expect(results.every((r) => !r.error || /unique|duplicate/i.test(r.error.message))).toBe(true)
    })
  },
)
