import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const migrations = [
  'scripts/089-ads-core-part1.sql',
  'scripts/090-ads-core-part2.sql',
  'scripts/091-ads-google-readonly.sql',
  'scripts/099-ads-google-public-readonly-quotas.sql',
  'scripts/106-ads-google-publish-e2.sql',
  'scripts/126-ads-meta-connections.sql',
  'scripts/127-ads-meta-publish.sql',
  'scripts/128-ads-meta-manage.sql',
  'scripts/129-ads-meta-plan-soft-delete.sql',
].map((file) => readFileSync(path.join(ROOT, file), 'utf8'))

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

let db: PGlite
let counter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  for (const migration of migrations) await db.exec(migration)
})

afterAll(async () => {
  await db.close()
})

async function newUser(): Promise<string> {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [`meta-plan-user-${counter}@example.com`],
  )
  return rows[0].id
}

async function newMetaConnection(userId: string): Promise<string> {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_connections (user_id, platform, external_account_id, refresh_token_enc, status, currency_code)
     values ($1, 'meta', $2, 'v1:iv:tag:body', 'active', 'TRY') returning id`,
    [userId, `act_${counter}`],
  )
  return rows[0].id
}

async function newPlan(userId: string, connectionId: string, status: 'draft' | 'published' | 'active' = 'published'): Promise<string> {
  if (status === 'draft') {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.ads_meta_plans (user_id, connection_id, status, content, currency)
       values ($1, $2, 'draft', '{}'::jsonb, 'TRY') returning id`,
      [userId, connectionId],
    )
    return rows[0].id
  }

  counter += 1
  const idBase = 100_000_000_000 + counter * 10
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_meta_plans (
       user_id, connection_id, status, content, currency, approved_at, plan_hash, approved_version, published_at,
       meta_campaign_id, meta_adset_id, meta_ad_id
     ) values ($1, $2, $3, '{}'::jsonb, 'TRY', now(), repeat('a', 64), 1, now(), $4, $5, $6)
     returning id`,
    [userId, connectionId, status, String(idBase + 1), String(idBase + 2), String(idBase + 3)],
  )
  return rows[0].id
}

const pausedMetaStatuses = {
  campaign: { status: 'PAUSED', effectiveStatus: 'CAMPAIGN_PAUSED' },
  adSet: { status: 'PAUSED', effectiveStatus: 'CAMPAIGN_PAUSED' },
  ad: { status: 'PAUSED', effectiveStatus: 'CAMPAIGN_PAUSED' },
}

async function deletePlan(userId: string, planId: string, statuses: unknown) {
  return db.query<{ state: string; deleted_at: string | null; plan_status: string | null }>(
    `select * from public.ads_soft_delete_meta_plan($1, $2, $3::jsonb)`,
    [userId, planId, statuses === null ? null : JSON.stringify(statuses)],
  )
}

describe('ads_soft_delete_meta_plan', () => {
  it('checks ownership, soft-deletes only the GLOVAL record, and writes an immutable audit row', async () => {
    const owner = await newUser()
    const otherUser = await newUser()
    const connectionId = await newMetaConnection(owner)
    const planId = await newPlan(owner, connectionId)

    expect((await deletePlan(otherUser, planId, pausedMetaStatuses)).rows[0].state).toBe('not_found')
    expect((await deletePlan(owner, planId, pausedMetaStatuses)).rows[0].state).toBe('deleted')

    const plan = (await db.query<{ status: string; deleted_at: string | null }>(
      `select status, deleted_at from public.ads_meta_plans where id = $1`, [planId],
    )).rows[0]
    expect(plan.status).toBe('archived')
    expect(plan.deleted_at).not.toBeNull()
    expect((await db.query(`select id from public.ads_meta_plans where id = $1 and deleted_at is null`, [planId])).rows).toHaveLength(0)

    const audit = (await db.query<{ action_type: string; before_state: Record<string, unknown>; after_state: Record<string, unknown> }>(
      `select action_type, before_state, after_state from public.ads_meta_actions where plan_id = $1`, [planId],
    )).rows[0]
    expect(audit.action_type).toBe('meta_plan_soft_deleted')
    expect(audit.before_state.status).toBe('published')
    expect(audit.after_state.status).toBe('archived')
    expect(audit.after_state.meta_statuses).toEqual(pausedMetaStatuses)
  })

  it('refuses active or unconfirmed Meta objects without mutating the plan or audit log', async () => {
    const userId = await newUser()
    const connectionId = await newMetaConnection(userId)
    const activePlanId = await newPlan(userId, connectionId, 'active')
    const activeStatuses = {
      campaign: { status: 'ACTIVE', effectiveStatus: 'ACTIVE' },
      adSet: { status: 'PAUSED', effectiveStatus: 'CAMPAIGN_PAUSED' },
      ad: { status: 'PAUSED', effectiveStatus: 'CAMPAIGN_PAUSED' },
    }
    expect((await deletePlan(userId, activePlanId, activeStatuses)).rows[0].state).toBe('active')
    expect((await deletePlan(userId, activePlanId, null)).rows[0].state).toBe('meta_confirmation_required')

    const plan = (await db.query<{ deleted_at: string | null }>(
      `select deleted_at from public.ads_meta_plans where id = $1`, [activePlanId],
    )).rows[0]
    expect(plan.deleted_at).toBeNull()
    expect((await db.query(`select id from public.ads_meta_actions where plan_id = $1`, [activePlanId])).rows).toHaveLength(0)
  })

  it('keeps plans deleted or archived in Meta marked archived in the panel state', async () => {
    const userId = await newUser()
    const connectionId = await newMetaConnection(userId)
    const planId = await newPlan(userId, connectionId)
    const statuses = {
      ...pausedMetaStatuses,
      campaign: { status: 'DELETED', effectiveStatus: 'DELETED' },
    }

    expect((await deletePlan(userId, planId, statuses)).rows[0].plan_status).toBe('archived')
    const row = (await db.query<{ status: string }>(`select status from public.ads_meta_plans where id = $1`, [planId])).rows[0]
    expect(row.status).toBe('archived')
  })

  it('allows removing an unpublished draft without a Meta read and still audits the soft delete', async () => {
    const userId = await newUser()
    const connectionId = await newMetaConnection(userId)
    const planId = await newPlan(userId, connectionId, 'draft')

    expect((await deletePlan(userId, planId, null)).rows[0].state).toBe('deleted')
    expect((await db.query(`select id from public.ads_meta_actions where plan_id = $1 and action_type = 'meta_plan_soft_deleted'`, [planId])).rows).toHaveLength(1)
  })

  it('allows the minimum-budgets Graph edge through the shared read quota', async () => {
    const userId = await newUser()
    const connectionId = await newMetaConnection(userId)
    const requestId = '22222222-2222-4222-8222-222222222222'
    const result = await db.query<{ allowed: boolean }>(
      `select allowed from public.ads_reserve_meta_api_operation($1, $2, $3, 'act.minimum_budgets', 30, 100)`,
      [requestId, userId, connectionId],
    )

    expect(result.rows[0].allowed).toBe(true)
    const operation = await db.query<{ endpoint: string }>(
      `select endpoint from public.ads_meta_api_operations where request_id = $1`, [requestId],
    )
    expect(operation.rows[0].endpoint).toBe('act.minimum_budgets')
  })
})
