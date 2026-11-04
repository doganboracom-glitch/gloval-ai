import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PART1 = readFileSync(path.join(ROOT, 'scripts/089-ads-core-part1.sql'), 'utf8')
const PART2 = readFileSync(path.join(ROOT, 'scripts/090-ads-core-part2.sql'), 'utf8')
const PART3 = readFileSync(path.join(ROOT, 'scripts/091-ads-google-readonly.sql'), 'utf8')
const LIVE_QUOTAS = readFileSync(path.join(ROOT, 'scripts/099-ads-google-public-readonly-quotas.sql'), 'utf8')
const MIGRATION = readFileSync(path.join(ROOT, 'scripts/106-ads-google-publish-e2.sql'), 'utf8')

const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid);
create table public.ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  amount integer not null,
  reason text,
  created_at timestamptz not null default now());
`

const PLAN = {
  brand: 'Local Search Studio',
  sector: 'services',
  sectorLabel: 'Local services',
  services: ['Local service'],
  language: 'en',
  languageFallback: false,
  competitiveness: 'medium',
  keywords: ['local service one', 'local service two', 'local service three'],
  negativeKeywords: [],
  country: 'US',
  cities: [],
  modelPolicyCategory: null,
  modelPolicyEvidence: 'none',
  euPoliticalAdvertising: 'no',
  euPoliticalDeclarationConfirmed: true,
  finalUrl: 'https://local-fixture.example/services',
  adCopy: {
    headlines: ['Local Search Studio', 'Thoughtful Service', 'Book a Consultation'],
    descriptions: ['A local service for your neighborhood.', 'Talk with the team about your project.'],
    displayUrl: 'https://local-fixture.example/services',
  },
}

const PLAN_HASH = 'a'.repeat(64)
const APPROVAL_SUMMARY = { currency: 'USD', dailyBudgetMinor: 15000, budgetCapMinor: 90000 }

type LiveBaseline = {
  e1_columns_present: boolean
  e2_columns_present: boolean
  approvals_table_present: boolean
  operation_count_present: boolean
  live_read_rpc_present: boolean
  legacy_four_arg_rpc_present: boolean
  live_connection_save_rpc_present: boolean
  action_trigger_present: boolean
  authenticated_can_select_plans: boolean
  authenticated_can_select_actions: boolean
}

let db: PGlite
let liveBaseline: LiveBaseline
let counter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(PART1)
  await db.exec(PART2)
  await db.exec(PART3)
  await db.exec(LIVE_QUOTAS)

  const { rows } = await db.query<LiveBaseline>(`
    select
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_plans' and column_name = 'approved_version') as e1_columns_present,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_plans' and column_name = 'approval_id') as e2_columns_present,
      to_regclass('public.ads_google_publish_approvals') is not null as approvals_table_present,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_google_api_operations' and column_name = 'operation_count') as operation_count_present,
      to_regprocedure('public.ads_reserve_google_api_operation(uuid,uuid,uuid,text,integer,integer)') is not null as live_read_rpc_present,
      to_regprocedure('public.ads_reserve_google_api_operation(uuid,uuid,uuid,text)') is not null as legacy_four_arg_rpc_present,
      to_regprocedure('public.ads_save_google_ads_connection_with_limit(uuid,text,text,text,text,text,smallint,text[],integer)') is not null as live_connection_save_rpc_present,
      exists (select 1 from pg_trigger where tgrelid = 'public.ads_actions'::regclass and tgname = 'ads_actions_guard_trg' and not tgisinternal) as action_trigger_present,
      has_table_privilege('authenticated', 'public.ads_plans', 'SELECT') as authenticated_can_select_plans,
      has_table_privilege('authenticated', 'public.ads_actions', 'SELECT') as authenticated_can_select_actions
  `)
  liveBaseline = rows[0]
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    delete from public.ads_actions;
    delete from public.ads_google_publish_credit_reservations;
    delete from public.ads_google_publish_approvals;
    delete from public.ads_google_api_operations;
    delete from public.ads_plans;
    delete from public.ads_brands;
    delete from public.ads_connections;
    delete from public.ads_usage_events;
    delete from public.ads_free_usage;
    delete from public.ads_free_reservations;
    delete from public.ads_alerts;
    delete from public.ai_credit_transactions;
    delete from auth.users;
  `)
})

async function newUser(credits = 100): Promise<string> {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [`e2-user-${counter}@example.test`],
  )
  const userId = rows[0].id
  await db.query(
    `insert into public.ai_credit_transactions (user_id, kind, amount, reason)
     values ($1, 'grant', $2, $3)`,
    [userId, credits, `e2-test-seed-${counter}`],
  )
  return userId
}

async function newConnection(userId: string): Promise<{ id: string; customerId: string }> {
  counter += 1
  const customerId = String(1_000_000_000 + counter)
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_connections
      (user_id, platform, external_account_id, refresh_token_enc, status, currency_code)
     values ($1, 'google_ads', $2, 'v1:iv:tag:body', 'active', 'USD') returning id`,
    [userId, customerId],
  )
  return { id: rows[0].id, customerId }
}

async function newDraft(userId: string, connectionId: string) {
  const { rows } = await db.query<{ state: string; plan_id: string; plan_version: number }>(
    `select * from public.ads_create_google_ads_plan_draft_e2(
      $1, $2, $3::jsonb, 'Local Search Studio', 'services', 'en', 15000, 90000, 'USD'
    )`,
    [userId, connectionId, JSON.stringify(PLAN)],
  )
  return rows[0]
}

async function approvePlan(input: {
  userId: string
  planId: string
  connectionId: string
  customerId: string
  declarationConfirmed: boolean
  termsAccepted: boolean
  expectedVersion?: number
  dailyBudgetMinor?: number
  budgetCapMinor?: number
  userDailyBudgetLimitMinor?: number
  approvalSummary?: Record<string, unknown>
}) {
  const { rows } = await db.query<{ state: string; approval_id: string | null; plan_version: number | null }>(
    `select * from public.ads_approve_google_ads_plan_e2(
      $1, $2, $9, $3, $4, 'USD', $10, $11, $12, $5, 'no', $6, $7, $8::jsonb
    )`,
    [
      input.userId,
      input.planId,
      input.connectionId,
      input.customerId,
      PLAN_HASH,
      input.declarationConfirmed,
      input.termsAccepted,
      JSON.stringify(input.approvalSummary ?? APPROVAL_SUMMARY),
      input.expectedVersion ?? 1,
      input.dailyBudgetMinor ?? 15000,
      input.budgetCapMinor ?? 90000,
      input.userDailyBudgetLimitMinor ?? 200000,
    ],
  )
  return rows[0]
}

describe('Google Ads combined publish migration on current 099 state', () => {
  it('applies idempotently over the 099 live baseline and preserves its RPCs and table grants', async () => {
    expect(liveBaseline).toEqual({
      e1_columns_present: false,
      e2_columns_present: false,
      approvals_table_present: false,
      operation_count_present: false,
      live_read_rpc_present: true,
      legacy_four_arg_rpc_present: false,
      live_connection_save_rpc_present: true,
      action_trigger_present: true,
      authenticated_can_select_plans: true,
      authenticated_can_select_actions: true,
    })

    const { rows } = await db.query<{
      e1_columns_present: boolean
      e2_columns_present: boolean
      approvals_table_present: boolean
      reservations_table_present: boolean
      operation_count_present: boolean
      live_read_rpc_present: boolean
      legacy_four_arg_rpc_present: boolean
      live_connection_save_rpc_present: boolean
      action_trigger_present: boolean
      authenticated_can_select_plans: boolean
      authenticated_can_select_actions: boolean
      authenticated_can_select_approvals: boolean
      authenticated_can_select_reservations: boolean
      service_role_can_select_approvals: boolean
      service_role_can_select_reservations: boolean
    }>(`
      select
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_plans' and column_name = 'approved_version') as e1_columns_present,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_plans' and column_name = 'approval_id') as e2_columns_present,
        to_regclass('public.ads_google_publish_approvals') is not null as approvals_table_present,
        to_regclass('public.ads_google_publish_credit_reservations') is not null as reservations_table_present,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ads_google_api_operations' and column_name = 'operation_count') as operation_count_present,
        to_regprocedure('public.ads_reserve_google_api_operation(uuid,uuid,uuid,text,integer,integer)') is not null as live_read_rpc_present,
        to_regprocedure('public.ads_reserve_google_api_operation(uuid,uuid,uuid,text)') is not null as legacy_four_arg_rpc_present,
        to_regprocedure('public.ads_save_google_ads_connection_with_limit(uuid,text,text,text,text,text,smallint,text[],integer)') is not null as live_connection_save_rpc_present,
        exists (select 1 from pg_trigger where tgrelid = 'public.ads_actions'::regclass and tgname = 'ads_actions_guard_trg' and not tgisinternal) as action_trigger_present,
        has_table_privilege('authenticated', 'public.ads_plans', 'SELECT') as authenticated_can_select_plans,
        has_table_privilege('authenticated', 'public.ads_actions', 'SELECT') as authenticated_can_select_actions,
        has_table_privilege('authenticated', 'public.ads_google_publish_approvals', 'SELECT') as authenticated_can_select_approvals,
        has_table_privilege('authenticated', 'public.ads_google_publish_credit_reservations', 'SELECT') as authenticated_can_select_reservations,
        has_table_privilege('service_role', 'public.ads_google_publish_approvals', 'SELECT') as service_role_can_select_approvals,
        has_table_privilege('service_role', 'public.ads_google_publish_credit_reservations', 'SELECT') as service_role_can_select_reservations
    `)
    expect(rows[0]).toEqual({
      e1_columns_present: true,
      e2_columns_present: true,
      approvals_table_present: true,
      reservations_table_present: true,
      operation_count_present: true,
      live_read_rpc_present: true,
      legacy_four_arg_rpc_present: false,
      live_connection_save_rpc_present: true,
      action_trigger_present: true,
      authenticated_can_select_plans: true,
      authenticated_can_select_actions: true,
      authenticated_can_select_approvals: false,
      authenticated_can_select_reservations: false,
      service_role_can_select_approvals: true,
      service_role_can_select_reservations: true,
    })

    await db.exec(MIGRATION)
  })

  it('requires terms, EU confirmation, approval hash, and validate_only record before reserving', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    expect(draft).toMatchObject({ state: 'created', plan_version: 1 })

    await expect(approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: false,
      termsAccepted: true,
    })).resolves.toMatchObject({ state: 'confirmation_required' })
    await expect(approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })).resolves.toMatchObject({ state: 'approved', plan_version: 1 })

    const approval = await db.query<{ approval_id: string }>(
      'select approval_id from public.ads_plans where id = $1',
      [draft.plan_id],
    )
    const approvalId = approval.rows[0].approval_id
    const requestId = '123e4567-e89b-42d3-a456-426614174099'
    const begin = (hash: string) => db.query<{ state: string; balance: number }>(
      `select * from public.ads_begin_google_ads_publish_e2(
        $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
        200000::integer, 1500::integer, 15000000::bigint, 2::smallint
      )`,
      [userId, draft.plan_id, requestId, approvalId, hash],
    )

    await expect(begin('b'.repeat(64))).resolves.toMatchObject({ rows: [{ state: 'plan_changed' }] })
    const noValidation = await begin(PLAN_HASH)
    expect(noValidation.rows[0].state).toBe('plan_changed')
    const unreserved = await db.query<{ count: number }>(
      'select count(*)::integer as count from public.ads_google_publish_credit_reservations',
    )
    expect(unreserved.rows[0].count).toBe(0)

    await expect(db.query(
      `select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)`,
      [userId, draft.plan_id, approvalId, PLAN_HASH],
    )).resolves.toMatchObject({ rows: [{ state: 'validated' }] })
    const reserved = await begin(PLAN_HASH)
    expect(reserved.rows[0]).toMatchObject({ state: 'started', balance: 85 })
    const ledgerBeforeFinalize = await db.query<{ balance: number }>(
      'select coalesce(sum(amount), 0)::integer as balance from public.ai_credit_transactions where user_id = $1',
      [userId],
    )
    expect(ledgerBeforeFinalize.rows[0].balance).toBe(100)

    const finalized = await db.query<{ state: string; balance: number; already_charged: boolean; charged_amount: number }>(
      `select * from public.ads_finalize_google_ads_publish_e2($1, $2, $3, '456789', false)`,
      [userId, draft.plan_id, requestId],
    )
    expect(finalized.rows[0]).toMatchObject({ state: 'published', balance: 85, already_charged: false, charged_amount: 15 })
    const duplicateFinalize = await db.query<{ state: string; already_charged: boolean; charged_amount: number }>(
      `select * from public.ads_finalize_google_ads_publish_e2($1, $2, $3, '456789', false)`,
      [userId, draft.plan_id, requestId],
    )
    expect(duplicateFinalize.rows[0]).toMatchObject({ state: 'published', already_charged: true, charged_amount: 0 })
    await expect(db.query(
      `select * from public.ads_finalize_google_ads_publish_e2($1, $2, $3, '456790', false)`,
      [userId, draft.plan_id, requestId],
    )).resolves.toMatchObject({ rows: [{ state: 'plan_changed' }] })
    const plan = await db.query<{ status: string; google_campaign_status: string; publish_credit_charged: boolean }>(
      'select status, google_campaign_status, publish_credit_charged from public.ads_plans where id = $1',
      [draft.plan_id],
    )
    expect(plan.rows[0]).toEqual({ status: 'published', google_campaign_status: 'PAUSED', publish_credit_charged: true })
    const charges = await db.query<{ count: number }>(
      `select count(*)::integer as count from public.ai_credit_transactions
       where user_id = $1 and reason = $2`,
      [userId, 'ads:publish:123e4567-e89b-42d3-a456-426614174099'],
    )
    expect(charges.rows[0].count).toBe(1)
  })

  it('cascades account deletion through an approved plan, connection, and credit reservation', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })
    expect(approval).toMatchObject({ state: 'approved', plan_version: 1 })

    const requestId = '123e4567-e89b-42d3-a456-426614174098'
    const validation = await db.query<{ state: string }>(
      'select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)',
      [userId, draft.plan_id, approval.approval_id, PLAN_HASH],
    )
    expect(validation.rows[0].state).toBe('validated')
    const reservation = await db.query<{ state: string }>(
      `select * from public.ads_begin_google_ads_publish_e2(
        $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
        200000::integer, 1500::integer, 15000000::bigint, 2::smallint
      )`,
      [userId, draft.plan_id, requestId, approval.approval_id, PLAN_HASH],
    )
    expect(reservation.rows[0].state).toBe('started')

    const beforeDelete = await db.query<{
      connections: number
      plans: number
      approvals: number
      reservations: number
    }>(`
      select
        (select count(*)::integer from public.ads_connections where user_id = $1) as connections,
        (select count(*)::integer from public.ads_plans where user_id = $1) as plans,
        (select count(*)::integer from public.ads_google_publish_approvals where user_id = $1) as approvals,
        (select count(*)::integer from public.ads_google_publish_credit_reservations where user_id = $1) as reservations
    `, [userId])
    expect(beforeDelete.rows[0]).toEqual({ connections: 1, plans: 1, approvals: 1, reservations: 1 })

    const foreignKey = await db.query<{ delete_action: string }>(`
      select confdeltype::text as delete_action
        from pg_constraint
       where conrelid = 'public.ads_google_publish_approvals'::regclass
         and confrelid = 'public.ads_connections'::regclass
    `)
    expect(foreignKey.rows).toEqual([{ delete_action: 'a' }])

    await db.query('delete from auth.users where id = $1', [userId])

    const afterDelete = await db.query<{
      connections: number
      plans: number
      approvals: number
      reservations: number
    }>(`
      select
        (select count(*)::integer from public.ads_connections where user_id = $1) as connections,
        (select count(*)::integer from public.ads_plans where user_id = $1) as plans,
        (select count(*)::integer from public.ads_google_publish_approvals where user_id = $1) as approvals,
        (select count(*)::integer from public.ads_google_publish_credit_reservations where user_id = $1) as reservations
    `, [userId])
    expect(afterDelete.rows[0]).toEqual({ connections: 0, plans: 0, approvals: 0, reservations: 0 })
  })

  it('allows a campaign-level daily cap above the user aggregate daily limit', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    await db.query('update public.ads_plans set budget_cap_minor = 300000 where id = $1', [draft.plan_id])

    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
      expectedVersion: 2,
      dailyBudgetMinor: 15000,
      budgetCapMinor: 300000,
      userDailyBudgetLimitMinor: 20000,
      approvalSummary: { currency: 'USD', dailyBudgetMinor: 15000, budgetCapMinor: 300000 },
    })

    expect(approval).toMatchObject({ state: 'approved', plan_version: 2 })
  })

  it('does not replay a reconciling publish and releases its credit hold without charging', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })
    const requestId = '123e4567-e89b-42d3-a456-426614174096'
    await db.query(`select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)`, [
      userId, draft.plan_id, approval.approval_id, PLAN_HASH,
    ])
    await db.query(`select * from public.ads_begin_google_ads_publish_e2(
      $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
      200000::integer, 1500::integer, 15000000::bigint, 2::smallint
    )`, [userId, draft.plan_id, requestId, approval.approval_id, PLAN_HASH])
    await db.query(`update public.ads_plans set status = 'reconciling' where id = $1`, [draft.plan_id])

    const replay = await db.query<{ state: string }>(
      `select * from public.ads_begin_google_ads_publish_e2(
        $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
        200000::integer, 1500::integer, 15000000::bigint, 2::smallint
      )`,
      [userId, draft.plan_id, requestId, approval.approval_id, PLAN_HASH],
    )
    expect(replay.rows[0].state).toBe('publish_in_progress')

    const released = await db.query<{ released: boolean }>(
      'select * from public.ads_release_google_ads_publish_e2($1, $2, $3, $4)',
      [userId, draft.plan_id, requestId, 'provider_error'],
    )
    expect(released.rows[0].released).toBe(true)
    const state = await db.query<{ status: string; reservation_status: string; balance: number }>(
      `select p.status, r.status as reservation_status,
         (select coalesce(sum(t.amount), 0)::integer from public.ai_credit_transactions t where t.user_id = p.user_id) as balance
       from public.ads_plans p join public.ads_google_publish_credit_reservations r on r.plan_id = p.id
       where p.id = $1`,
      [draft.plan_id],
    )
    expect(state.rows[0]).toEqual({ status: 'failed', reservation_status: 'released', balance: 100 })
  })

  it('reconciles stale E2 publishes and records the admin resolution in ads_actions', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })
    const requestId = '123e4567-e89b-42d3-a456-426614174090'
    await db.query('select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)', [
      userId, draft.plan_id, approval.approval_id, PLAN_HASH,
    ])
    await db.query(`select * from public.ads_begin_google_ads_publish_e2(
      $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
      200000::integer, 1500::integer, 15000000::bigint, 2::smallint
    )`, [userId, draft.plan_id, requestId, approval.approval_id, PLAN_HASH])
    await db.query("update public.ads_plans set publish_started_at = now() - interval '11 minutes' where id = $1", [draft.plan_id])

    await expect(db.query('select * from public.ads_reconcile_stale_google_ads_publishes(100)'))
      .resolves.toMatchObject({ rows: [{ plan_id: draft.plan_id, publish_request_id: requestId }] })
    const resolution = await db.query<{ state: string; refunded: boolean; balance: number }>(
      `select * from public.ads_resolve_google_ads_publish($1, $2, 'published', '456789', 'operator@example.com')`,
      [draft.plan_id, requestId],
    )
    expect(resolution.rows[0]).toEqual({ state: 'published', refunded: false, balance: 85 })

    const audit = await db.query<{ action_type: string; admin_email: string; external_campaign_id: string }>(
      `select action_type, after_state->>'admin_email' as admin_email,
              after_state->>'external_campaign_id' as external_campaign_id
         from public.ads_actions
        where plan_id = $1 and action_type = 'publish_reconciliation_resolved'`,
      [draft.plan_id],
    )
    expect(audit.rows).toEqual([{
      action_type: 'publish_reconciliation_resolved',
      admin_email: 'operator@example.com',
      external_campaign_id: '456789',
    }])
  })

  it('refunds charged reservations and audits admin-confirmed failed publishes', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })
    const requestId = '123e4567-e89b-42d3-a456-426614174091'
    await db.query('select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)', [
      userId, draft.plan_id, approval.approval_id, PLAN_HASH,
    ])
    await db.query(`select * from public.ads_begin_google_ads_publish_e2(
      $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
      200000::integer, 1500::integer, 15000000::bigint, 2::smallint
    )`, [userId, draft.plan_id, requestId, approval.approval_id, PLAN_HASH])
    await db.query('select * from public.ads_charge_credits($1, 15, $2)', [userId, `ads:publish:${requestId}`])
    await db.query("update public.ads_google_publish_credit_reservations set status = 'charged' where request_id = $1", [requestId])
    await db.query("update public.ads_plans set status = 'reconciling', publish_credit_charged = true where id = $1", [draft.plan_id])

    const resolution = await db.query<{ state: string; refunded: boolean; balance: number }>(
      `select * from public.ads_resolve_google_ads_publish($1, $2, 'failed_refunded', null, 'operator@example.com')`,
      [draft.plan_id, requestId],
    )
    expect(resolution.rows[0]).toEqual({ state: 'failed_refunded', refunded: true, balance: 100 })
    const audit = await db.query<{ admin_email: string; refunded: boolean }>(
      `select after_state->>'admin_email' as admin_email,
              (after_state->>'refunded')::boolean as refunded
         from public.ads_actions
        where plan_id = $1 and action_type = 'publish_reconciliation_resolved'`,
      [draft.plan_id],
    )
    expect(audit.rows).toEqual([{ admin_email: 'operator@example.com', refunded: true }])
  })

  it('records and idempotently finishes an approved before/after campaign action', async () => {
    const userId = await newUser()
    const connection = await newConnection(userId)
    const draft = await newDraft(userId, connection.id)
    const approval = await approvePlan({
      userId,
      planId: draft.plan_id,
      connectionId: connection.id,
      customerId: connection.customerId,
      declarationConfirmed: true,
      termsAccepted: true,
    })
    const approvalId = approval.approval_id as string
    const requestId = '123e4567-e89b-42d3-a456-426614174098'

    await db.query(`select * from public.ads_record_google_ads_validation_e2($1, $2, 1, $3, $4)`, [
      userId, draft.plan_id, approvalId, PLAN_HASH,
    ])
    await db.query(`select * from public.ads_begin_google_ads_publish_e2(
      $1::uuid, $2::uuid, $3::uuid, 1::integer, $4::uuid, $5::text,
        200000::integer, 1500::integer, 15000000::bigint, 2::smallint
    )`, [userId, draft.plan_id, requestId, approvalId, PLAN_HASH])
    await db.query(`select * from public.ads_finalize_google_ads_publish_e2($1, $2, $3, '456790', true)`, [
      userId, draft.plan_id, requestId,
    ])

    const actionId = '123e4567-e89b-42d3-a456-426614174097'
    const target = { status: 'ENABLED' }
    const before = { status: 'PAUSED' }
    const beginAction = () => db.query<{ state: string; action_id: string }>(
      `select * from public.ads_begin_google_ads_campaign_action_e2(
        $1, $2, $3, 'google_ads_campaign_status_update', 1, $4, $5::jsonb, $6::jsonb, 200000, true
      )`,
      [userId, draft.plan_id, actionId, PLAN_HASH, JSON.stringify(target), JSON.stringify(before)],
    )
    await expect(beginAction()).resolves.toMatchObject({ rows: [{ state: 'approved', action_id: actionId }] })
    await expect(beginAction()).resolves.toMatchObject({ rows: [{ state: 'existing', action_id: actionId }] })
    await expect(db.query(
      `select * from public.ads_finish_google_ads_campaign_action_e2($1, $2, 'applied', $3::jsonb, null)`,
      [userId, actionId, JSON.stringify({ status: 'ENABLED' })],
    )).resolves.toMatchObject({ rows: [{ state: 'applied' }] })

    const action = await db.query<{ status: string; before_state: unknown; after_state: unknown }>(
      'select status, before_state, after_state from public.ads_actions where id = $1',
      [actionId],
    )
    expect(action.rows[0]).toEqual({ status: 'applied', before_state: before, after_state: { status: 'ENABLED' } })
    const plan = await db.query<{ google_campaign_status: string }>(
      'select google_campaign_status from public.ads_plans where id = $1',
      [draft.plan_id],
    )
    expect(plan.rows[0].google_campaign_status).toBe('ENABLED')
  })
})
