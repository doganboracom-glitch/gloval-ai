import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Runs the Ads SQL migrations, exactly as applied to production, against an
 * in-process Postgres (PGlite) with a minimal stand-in for their dependencies.
 * No real database is touched.
 */

const ROOT = process.cwd()
const PART1 = readFileSync(path.join(ROOT, 'scripts/089-ads-core-part1.sql'), 'utf8')
const PART2 = readFileSync(path.join(ROOT, 'scripts/090-ads-core-part2.sql'), 'utf8')
const PART3 = readFileSync(path.join(ROOT, 'scripts/091-ads-google-readonly.sql'), 'utf8')

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
  await db.exec(PART1)
  await db.exec(PART2)
  await db.exec(PART3)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`
    delete from public.ads_google_api_operations;
    delete from public.ads_google_oauth_flows;
    delete from public.ads_actions;
    delete from public.ads_recommendations;
    delete from public.ads_plans;
    delete from public.ads_brands;
    delete from public.ads_connections;
    delete from public.ads_usage_events;
    delete from public.ads_free_usage;
    delete from public.ads_free_reservations;
    delete from public.ads_alerts;
    delete from public.ai_credit_transactions;
  `)
})

async function newUser(): Promise<string> {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [`ads-user${counter}@example.com`],
  )
  return rows[0].id
}

async function newConnection(userId: string, status = 'active'): Promise<string> {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_connections (user_id, platform, external_account_id, refresh_token_enc, status)
     values ($1, 'google_ads', $2, 'v1:iv:tag:body', $3) returning id`,
    [userId, `acct-${counter}`, status],
  )
  return rows[0].id
}

async function newBrand(userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_brands (user_id, source, url, language)
     values ($1, 'external_url', 'https://example.com', 'tr') returning id`,
    [userId],
  )
  return rows[0].id
}

async function newPlan(userId: string, brandId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ['user_id', 'brand_id', 'plan', ...Object.keys(extra)]
  const values: unknown[] = [userId, brandId, JSON.stringify({ campaign: 'x' }), ...Object.values(extra)]
  const placeholders = cols.map((c, i) => (c === 'plan' ? `$${i + 1}::jsonb` : `$${i + 1}`))
  const { rows } = await db.query<{ id: string }>(
    `insert into public.ads_plans (${cols.join(',')}) values (${placeholders.join(',')}) returning id`,
    values,
  )
  return rows[0].id
}

async function actionsFor(planOrConnection: { planId?: string; connectionId?: string }) {
  const { rows } = await db.query<{ action_type: string; before_state: unknown; after_state: unknown }>(
    `select action_type, before_state, after_state from public.ads_actions
      where ($1::uuid is null or plan_id = $1) and ($2::uuid is null or connection_id = $2)
      order by created_at, id`,
    [planOrConnection.planId ?? null, planOrConnection.connectionId ?? null],
  )
  return rows
}

describe('ads_forbid_owner_change', () => {
  it('rejects changing user_id on connections, brands, plans and recommendations', async () => {
    const a = await newUser()
    const b = await newUser()
    const conn = await newConnection(a)
    const brand = await newBrand(a)
    const plan = await newPlan(a, brand)
    const rec = (
      await db.query<{ id: string }>(
        `insert into public.ads_recommendations (user_id, kind, title) values ($1,'k','t') returning id`,
        [a],
      )
    ).rows[0].id

    for (const [table, id] of [
      ['ads_connections', conn],
      ['ads_brands', brand],
      ['ads_plans', plan],
      ['ads_recommendations', rec],
    ] as const) {
      await expect(db.query(`update public.${table} set user_id = $1 where id = $2`, [b, id])).rejects.toThrow()
    }
  })

  it('still allows ordinary updates and touches updated_at', async () => {
    const a = await newUser()
    const conn = await newConnection(a)
    const before = (
      await db.query<{ updated_at: string }>(`select updated_at from public.ads_connections where id=$1`, [conn])
    ).rows[0].updated_at
    await db.query(`select pg_sleep(0.01)`)
    await db.query(`update public.ads_connections set external_account_name = 'Shop' where id = $1`, [conn])
    const after = (
      await db.query<{ updated_at: string; external_account_name: string }>(
        `select updated_at, external_account_name from public.ads_connections where id=$1`,
        [conn],
      )
    ).rows[0]
    expect(after.external_account_name).toBe('Shop')
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime())
  })
})

describe('ads_actions_guard (append-only)', () => {
  async function newAction(userId: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.ads_actions (user_id, actor, action_type, target, before_state)
       values ($1,'user','pause_campaign','{"id":"c1"}'::jsonb,'{"status":"on"}'::jsonb) returning id`,
      [userId],
    )
    return rows[0].id
  }

  it('lets only status, after_state and applied_at change', async () => {
    const u = await newUser()
    const id = await newAction(u)
    await db.query(
      `update public.ads_actions set status='applied', after_state='{"status":"off"}'::jsonb, applied_at=now() where id=$1`,
      [id],
    )
    const { rows } = await db.query<{ status: string }>(`select status from public.ads_actions where id=$1`, [id])
    expect(rows[0].status).toBe('applied')
  })

  it.each([
    ['actor', `actor = 'ai'`],
    ['action_type', `action_type = 'other'`],
    ['target', `target = '{"id":"c2"}'::jsonb`],
    ['before_state', `before_state = '{"status":"off"}'::jsonb`],
    ['created_at', `created_at = now() + interval '1 day'`],
  ])('rejects rewriting %s', async (_name, assignment) => {
    const u = await newUser()
    const id = await newAction(u)
    await expect(db.query(`update public.ads_actions set ${assignment} where id=$1`, [id])).rejects.toThrow(
      /append-only/,
    )
  })

  it('rejects rewriting user_id', async () => {
    const a = await newUser()
    const b = await newUser()
    const id = await newAction(a)
    await expect(db.query(`update public.ads_actions set user_id=$1 where id=$2`, [b, id])).rejects.toThrow(
      /append-only/,
    )
  })

  it('allows only one undo per action', async () => {
    const u = await newUser()
    const id = await newAction(u)
    const undo = () =>
      db.query(
        `insert into public.ads_actions (user_id, actor, action_type, undone_of) values ($1,'user','undo',$2)`,
        [u, id],
      )
    await undo()
    await expect(undo()).rejects.toThrow()
  })
})

describe('owner consistency triggers', () => {
  it('ads_plans_check_owners rejects another user\'s brand', async () => {
    const a = await newUser()
    const b = await newUser()
    const brandOfB = await newBrand(b)
    await expect(newPlan(a, brandOfB)).rejects.toThrow(/brand does not belong/)
  })

  it('ads_plans_check_owners rejects another user\'s connection on insert and update', async () => {
    const a = await newUser()
    const b = await newUser()
    const brand = await newBrand(a)
    const connOfB = await newConnection(b)
    await expect(newPlan(a, brand, { connection_id: connOfB })).rejects.toThrow(/connection does not belong/)

    const plan = await newPlan(a, brand)
    await expect(
      db.query(`update public.ads_plans set connection_id=$1 where id=$2`, [connOfB, plan]),
    ).rejects.toThrow(/connection does not belong/)
  })

  it('ads_plans_check_owners accepts the owner\'s own brand and connection', async () => {
    const a = await newUser()
    const brand = await newBrand(a)
    const conn = await newConnection(a)
    await expect(newPlan(a, brand, { connection_id: conn })).resolves.toBeTruthy()
  })

  it('ads_actions_check_owners rejects another user\'s plan, connection and undone action', async () => {
    const a = await newUser()
    const b = await newUser()
    const planOfB = await newPlan(b, await newBrand(b))
    const connOfB = await newConnection(b)
    const actionOfB = (
      await db.query<{ id: string }>(
        `insert into public.ads_actions (user_id, actor, action_type) values ($1,'user','x') returning id`,
        [b],
      )
    ).rows[0].id

    await expect(
      db.query(`insert into public.ads_actions (user_id, actor, action_type, plan_id) values ($1,'user','x',$2)`, [
        a,
        planOfB,
      ]),
    ).rejects.toThrow(/plan does not belong/)
    await expect(
      db.query(
        `insert into public.ads_actions (user_id, actor, action_type, connection_id) values ($1,'user','x',$2)`,
        [a, connOfB],
      ),
    ).rejects.toThrow(/connection does not belong/)
    await expect(
      db.query(`insert into public.ads_actions (user_id, actor, action_type, undone_of) values ($1,'user','x',$2)`, [
        a,
        actionOfB,
      ]),
    ).rejects.toThrow(/undone action does not belong/)
  })

  it('ads_recommendations_check_owner rejects another user\'s plan', async () => {
    const a = await newUser()
    const b = await newUser()
    const planOfB = await newPlan(b, await newBrand(b))
    await expect(
      db.query(`insert into public.ads_recommendations (user_id, plan_id, kind, title) values ($1,$2,'k','t')`, [
        a,
        planOfB,
      ]),
    ).rejects.toThrow(/plan does not belong/)
  })
})

describe('audit triggers', () => {
  it('records plan creation and each status change with before/after state', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    const plan = await newPlan(u, brand)

    await db.query(
      `update public.ads_plans
          set status='approved', daily_budget_minor=5000, budget_cap_minor=150000, approved_at=now()
        where id=$1`,
      [plan],
    )
    // A non-status update must not add an audit row.
    await db.query(`update public.ads_plans set failure_reason='n/a' where id=$1`, [plan])

    const rows = await actionsFor({ planId: plan })
    expect(rows.map((r) => r.action_type)).toEqual(['plan_created', 'plan_status_changed'])
    expect(rows[1].before_state).toEqual({ status: 'draft' })
    expect(rows[1].after_state).toMatchObject({
      status: 'approved',
      daily_budget_minor: 5000,
      budget_cap_minor: 150000,
    })
  })

  it('records connection creation and status changes', async () => {
    const u = await newUser()
    const conn = await newConnection(u, 'pending')
    await db.query(`update public.ads_connections set status='error', last_error='boom' where id=$1`, [conn])
    const rows = await actionsFor({ connectionId: conn })
    expect(rows.map((r) => r.action_type)).toEqual(['connection_created', 'connection_status_changed'])
    expect(rows[1].before_state).toEqual({ status: 'pending' })
    expect(rows[1].after_state).toEqual({ status: 'error', error: 'boom' })
  })
})

describe('ads_plans approval and publish constraints', () => {
  it('rejects approval without budget cap, daily budget and approved_at', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    await expect(newPlan(u, brand, { status: 'approved' })).rejects.toThrow(/ads_plans_approval_requires_cap/)
    await expect(
      newPlan(u, brand, { status: 'approved', daily_budget_minor: 5000, budget_cap_minor: 150000 }),
    ).rejects.toThrow(/ads_plans_approval_requires_cap/)
  })

  it('rejects a daily budget above the cap', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    await expect(newPlan(u, brand, { daily_budget_minor: 9000, budget_cap_minor: 5000 })).rejects.toThrow(
      /ads_plans_daily_within_cap/,
    )
  })

  it('rejects non-positive budgets', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    await expect(newPlan(u, brand, { daily_budget_minor: 0 })).rejects.toThrow()
    await expect(newPlan(u, brand, { budget_cap_minor: -1 })).rejects.toThrow()
  })

  it('accepts a fully specified approved plan', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    await expect(
      db.query(
        `insert into public.ads_plans (user_id, brand_id, plan, status, daily_budget_minor, budget_cap_minor, approved_at)
         values ($1,$2,'{}'::jsonb,'approved',5000,150000,now())`,
        [u, brand],
      ),
    ).resolves.toBeTruthy()
  })

  it('rejects publishing without a connection, publish time and external campaign id', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    const base = {
      status: 'published',
      daily_budget_minor: 5000,
      budget_cap_minor: 150000,
      approved_at: new Date().toISOString(),
    }
    await expect(newPlan(u, brand, base)).rejects.toThrow(/ads_plans_publish_requires_connection/)

    const conn = await newConnection(u)
    await expect(newPlan(u, brand, { ...base, connection_id: conn })).rejects.toThrow(
      /ads_plans_publish_requires_connection/,
    )
    await expect(
      newPlan(u, brand, {
        ...base,
        connection_id: conn,
        published_at: new Date().toISOString(),
        external_campaign_id: 'cmp-1',
      }),
    ).resolves.toBeTruthy()
  })

  it('forbids the same external campaign twice on one connection', async () => {
    const u = await newUser()
    const brand = await newBrand(u)
    const conn = await newConnection(u)
    const publish = {
      status: 'published',
      daily_budget_minor: 5000,
      budget_cap_minor: 150000,
      approved_at: new Date().toISOString(),
      connection_id: conn,
      published_at: new Date().toISOString(),
      external_campaign_id: 'cmp-dup',
    }
    await newPlan(u, brand, publish)
    await expect(newPlan(u, brand, publish)).rejects.toThrow()
  })
})

describe('ads_record_alert_once', () => {
  it('returns true once per kind per day and false afterwards', async () => {
    const call = async (kind: string) =>
      (await db.query<{ r: boolean }>(`select public.ads_record_alert_once($1, '{"n":1}'::jsonb) as r`, [kind]))
        .rows[0].r
    expect(await call('daily_cap_80')).toBe(true)
    expect(await call('daily_cap_80')).toBe(false)
    expect(await call('daily_cap_100')).toBe(true)
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.ads_alerts`)
    expect(rows[0].n).toBe(2)
  })

  it('allows the same kind again on a different day', async () => {
    await db.query(`insert into public.ads_alerts (kind, day) values ('daily_cap_80', current_date - 3)`)
    const { rows } = await db.query<{ r: boolean }>(`select public.ads_record_alert_once('daily_cap_80') as r`)
    expect(rows[0].r).toBe(true)
  })

  it('validates the kind', async () => {
    await expect(db.query(`select public.ads_record_alert_once('')`)).rejects.toThrow(/alert kind/)
    await expect(db.query(`select public.ads_record_alert_once(null)`)).rejects.toThrow(/alert kind/)
  })
})

describe('ads_purge_expired', () => {
  type Purged = {
    free_usage: number
    reservations: number
    anon_hashes: number
    usage_events: number
    alerts: number
    google_oauth_flows: number
    google_api_operations: number
    batch: number
  }
  const purge = async (args = '') =>
    (await db.query<{ r: Purged }>(`select public.ads_purge_expired(${args}) as r`)).rows[0].r
  const count = async (table: string, where = 'true') =>
    (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`)).rows[0].n

  async function seedOldFreeUsage(n: number) {
    for (let i = 0; i < n; i += 1) {
      await db.query(`insert into public.ads_free_usage (subject, day, used) values ($1, current_date - 40, 1)`, [
        `old:${i}`,
      ])
    }
    await db.query(`insert into public.ads_free_usage (subject, day, used) values ('fresh', current_date, 1)`)
  }

  it('deletes only rows past retention and keeps fresh ones', async () => {
    await seedOldFreeUsage(3)
    await db.query(
      `insert into public.ads_free_reservations (request_id, subjects, day, created_at)
       values ('old-res', array['a'], current_date - 40, now() - interval '30 days'),
              ('new-res', array['a'], current_date, now())`,
    )
    await db.query(
      `insert into public.ads_alerts (kind, day) values ('old', current_date - 200), ('new', current_date)`,
    )

    const result = await purge()
    expect(result).toMatchObject({ free_usage: 3, reservations: 1, alerts: 1 })
    expect(await count('ads_free_usage')).toBe(1)
    expect(await count('ads_free_reservations')).toBe(1)
    expect(await count('ads_alerts')).toBe(1)
  })

  it('honours the batch size and finishes over repeated runs', async () => {
    await seedOldFreeUsage(5)
    expect((await purge('14, 7, 30, 400, 90, 2')).free_usage).toBe(2)
    expect(await count('ads_free_usage')).toBe(4)
    expect((await purge('14, 7, 30, 400, 90, 2')).free_usage).toBe(2)
    expect((await purge('14, 7, 30, 400, 90, 2')).free_usage).toBe(1)
    expect((await purge('14, 7, 30, 400, 90, 2')).free_usage).toBe(0)
    expect(await count('ads_free_usage')).toBe(1)
  })

  it('nulls anonymous hashes after 30 days but keeps the usage row, then drops it after 400', async () => {
    await db.query(
      `insert into public.ads_usage_events (anon_subject_hash, flow, model, outcome, created_at) values
        ('recent', 'scan', 'm', 'ok', now() - interval '5 days'),
        ('stale',  'scan', 'm', 'ok', now() - interval '60 days'),
        (null,     'scan', 'm', 'ok', now() - interval '500 days')`,
    )
    const result = await purge()
    expect(result.anon_hashes).toBe(1)
    expect(result.usage_events).toBe(1)
    expect(await count('ads_usage_events')).toBe(2)
    expect(await count('ads_usage_events', `anon_subject_hash is not null`)).toBe(1)
    expect(await count('ads_usage_events', `anon_subject_hash = 'recent'`)).toBe(1)
  })

  it('purges expired OAuth flows and operation history after the quota window', async () => {
    const userId = await newUser()
    await db.query(
      `insert into public.ads_google_oauth_flows (user_id, state_hash, code_verifier_enc, expires_at, created_at)
       values ($1, repeat('a', 64), 'encrypted-verifier', now() - interval '1 minute', now() - interval '20 minutes'),
              ($1, repeat('b', 64), 'encrypted-verifier', now() + interval '10 minutes', now())`,
      [userId],
    )
    await db.query(
      `insert into public.ads_google_api_operations (request_id, user_id, method, created_at)
       values (gen_random_uuid(), $1, 'googleAds.search', now() - interval '26 hours'),
              (gen_random_uuid(), $1, 'googleAds.search', now())`,
      [userId],
    )

    const result = await purge()
    expect(result).toMatchObject({ google_oauth_flows: 1, google_api_operations: 1 })
    expect(await count('ads_google_oauth_flows')).toBe(1)
    expect(await count('ads_google_api_operations')).toBe(1)
  })

  it('rejects invalid retention and batch values', async () => {
    await expect(purge('0')).rejects.toThrow(/retention periods/)
    await expect(purge('14, 7, 30, 400, 90, 0')).rejects.toThrow(/batch must be/)
    await expect(purge('14, 7, 30, 400, 90, 50001')).rejects.toThrow(/batch must be/)
  })
})

describe('credit RPCs', () => {
  const REASON = 'ads:scan_and_preview:req-abcdef12'
  const seed = (userId: string, amount: number) =>
    db.query(`insert into public.ai_credit_transactions (user_id, kind, amount, reason) values ($1,'grant',$2,'seed')`, [
      userId,
      amount,
    ])
  const balance = async (userId: string) =>
    (
      await db.query<{ b: number }>(
        `select coalesce(sum(amount),0)::int as b from public.ai_credit_transactions where user_id=$1`,
        [userId],
      )
    ).rows[0].b
  const charge = async (userId: string, amount: number, reason = REASON) =>
    (
      await db.query<Record<string, unknown>>(`select * from public.ads_charge_credits($1,$2,$3)`, [
        userId,
        amount,
        reason,
      ])
    ).rows[0]
  const refund = async (userId: string, reason = REASON) =>
    (await db.query<Record<string, unknown>>(`select * from public.ads_refund_credits($1,$2)`, [userId, reason]))
      .rows[0]

  it('charges once per reason; a retry reports already_charged and takes nothing more', async () => {
    const u = await newUser()
    await seed(u, 10)
    expect(await charge(u, 3)).toMatchObject({ ok: true, balance: 7, already_charged: false, charged_amount: 3 })
    expect(await charge(u, 3)).toMatchObject({ ok: true, balance: 7, already_charged: true, charged_amount: 3 })
    expect(await balance(u)).toBe(7)
  })

  it('refuses when the balance is too low and writes nothing', async () => {
    const u = await newUser()
    await seed(u, 2)
    expect(await charge(u, 3)).toMatchObject({ ok: false, balance: 2, charged_amount: 0 })
    expect(await balance(u)).toBe(2)
  })

  it('refunds exactly what was charged, once', async () => {
    const u = await newUser()
    await seed(u, 10)
    await charge(u, 3)
    expect(await refund(u)).toMatchObject({ refunded: true, balance: 10, refunded_amount: 3 })
    expect(await refund(u)).toMatchObject({ refunded: false, balance: 10, refunded_amount: 0 })
    expect(await balance(u)).toBe(10)
  })

  it('does not refund a request that was never charged', async () => {
    const u = await newUser()
    await seed(u, 10)
    expect(await refund(u)).toMatchObject({ refunded: false, refunded_amount: 0 })
  })

  it('rejects malformed reasons and amounts', async () => {
    const u = await newUser()
    await seed(u, 10)
    await expect(charge(u, 3, 'scan:whatever')).rejects.toThrow(/reason must match/)
    await expect(charge(u, 0)).rejects.toThrow(/amount must be/)
    await expect(charge(u, 1001)).rejects.toThrow(/amount must be/)
    await expect(refund(u, 'nope')).rejects.toThrow(/charge reason must match/)
  })

  it('the unique ledger index blocks a second ads: row with the same reason', async () => {
    const u = await newUser()
    await db.query(`insert into public.ai_credit_transactions (user_id, kind, amount, reason) values ($1,'usage',-1,$2)`, [
      u,
      REASON,
    ])
    await expect(
      db.query(`insert into public.ai_credit_transactions (user_id, kind, amount, reason) values ($1,'usage',-1,$2)`, [
        u,
        REASON,
      ]),
    ).rejects.toThrow()
  })
})

describe('free quota RPCs', () => {
  const reserve = async (id: string, subjects: string[], limits: number[]) =>
    (
      await db.query<{ allowed: boolean; blocked_subject: string | null; already_reserved: boolean }>(
        `select * from public.reserve_ads_free_actions($1,$2::text[],$3::int[])`,
        [id, subjects, limits],
      )
    ).rows[0]
  const release = async (id: string) =>
    (await db.query<{ r: boolean }>(`select public.release_ads_free_actions($1) as r`, [id])).rows[0].r
  const usage = async () =>
    Object.fromEntries(
      (await db.query<{ subject: string; used: number }>(`select subject, used from public.ads_free_usage`)).rows.map(
        (r) => [r.subject, r.used],
      ),
    )

  it('reserves, is idempotent per request id, and blocks over-limit requests without partial counting', async () => {
    const subjects = ['s:a', 's:b']
    const limits = [1, 5]
    expect(await reserve('req-0000-0001', subjects, limits)).toMatchObject({ allowed: true, already_reserved: false })
    expect(await reserve('req-0000-0001', subjects, limits)).toMatchObject({ allowed: true, already_reserved: true })
    expect(await reserve('req-0000-0002', subjects, limits)).toMatchObject({
      allowed: false,
      blocked_subject: 's:a',
    })
    expect(await usage()).toEqual({ 's:a': 1, 's:b': 1 })
  })

  it('keeps explicit policy-block counters independent from regular free-scan quota', async () => {
    const policySubjects = ['ads:policy:user:identity-hash', 'ads:policy:ip:ip-hash', 'ads:policy:global']
    const policyLimits = [3, 10, 60]
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(
        await reserve(`policy-block-${String(attempt).padStart(4, '0')}`, policySubjects, policyLimits),
      ).toMatchObject({ allowed: true })
    }
    expect(await reserve('policy-block-0004', policySubjects, policyLimits)).toMatchObject({
      allowed: false,
      blocked_subject: policySubjects[0],
    })

    expect(await reserve('free-scan-0001', ['ads:user:identity-hash'], [1])).toMatchObject({ allowed: true })
    expect(await usage()).toEqual({
      'ads:policy:user:identity-hash': 3,
      'ads:policy:ip:ip-hash': 3,
      'ads:policy:global': 3,
      'ads:user:identity-hash': 1,
    })
  })

  it('releases once and lets the same request id reserve again', async () => {
    await reserve('req-0000-0003', ['s:c'], [1])
    expect(await release('req-0000-0003')).toBe(true)
    expect(await release('req-0000-0003')).toBe(false)
    expect(await usage()).toEqual({ 's:c': 0 })
    expect(await reserve('req-0000-0003', ['s:c'], [1])).toMatchObject({ allowed: true, already_reserved: false })
    expect(await usage()).toEqual({ 's:c': 1 })
  })

  it('validates its inputs', async () => {
    await expect(reserve('', ['x'], [1])).rejects.toThrow(/request id/)
    await expect(reserve('req-0000-0004', ['x', 'x'], [1, 1])).rejects.toThrow(/distinct/)
    await expect(reserve('req-0000-0004', ['x'], [0])).rejects.toThrow(/positive/)
    await expect(reserve('req-0000-0004', ['x', 'y'], [1])).rejects.toThrow(/equal length/)
  })
})

describe('Google Ads API operation quotas', () => {
  const reserve = async (requestId: string, userId: string, connectionId: string | null = null) =>
    (
      await db.query<{ allowed: boolean; global_used: number; user_used: number }>(
        `select * from public.ads_reserve_google_api_operation($1, $2, $3, 'googleAds.search')`,
        [requestId, userId, connectionId],
      )
    ).rows[0]

  it('reserves each attempted operation once and returns rolling totals', async () => {
    const userId = await newUser()
    expect(await reserve('00000000-0000-4000-8000-000000000001', userId)).toEqual({
      allowed: true,
      global_used: 1,
      user_used: 1,
    })
    expect(await reserve('00000000-0000-4000-8000-000000000002', userId)).toEqual({
      allowed: true,
      global_used: 2,
      user_used: 2,
    })
  })

  it('enforces the per-user rolling cap without inserting a denied operation', async () => {
    const userId = await newUser()
    await db.query(
      `insert into public.ads_google_api_operations (request_id, user_id, method, created_at)
       select gen_random_uuid(), $1, 'googleAds.search', now() - interval '1 hour'
         from generate_series(1, 119)`,
      [userId],
    )
    expect(await reserve('00000000-0000-4000-8000-000000000003', userId)).toMatchObject({
      allowed: true,
      global_used: 120,
      user_used: 120,
    })
    expect(await reserve('00000000-0000-4000-8000-000000000004', userId)).toMatchObject({
      allowed: false,
      global_used: 120,
      user_used: 120,
    })
    expect(
      (await db.query<{ n: number }>(`select count(*)::int as n from public.ads_google_api_operations`)).rows[0].n,
    ).toBe(120)
  })

  it('enforces the shared project rolling cap across users', async () => {
    const owner = await newUser()
    const nextUser = await newUser()
    await db.query(
      `insert into public.ads_google_api_operations (request_id, user_id, method, created_at)
       select gen_random_uuid(), $1, 'googleAds.search', now() - interval '1 hour'
         from generate_series(1, 2399)`,
      [owner],
    )
    expect(await reserve('00000000-0000-4000-8000-000000000005', nextUser)).toMatchObject({
      allowed: true,
      global_used: 2400,
      user_used: 1,
    })
    expect(await reserve('00000000-0000-4000-8000-000000000006', nextUser)).toMatchObject({
      allowed: false,
      global_used: 2400,
      user_used: 1,
    })
  })

  it('rejects a connection owned by another user', async () => {
    const owner = await newUser()
    const other = await newUser()
    const connectionId = await newConnection(owner)
    await expect(reserve('00000000-0000-4000-8000-000000000007', other, connectionId)).rejects.toThrow(
      /does not belong to user/,
    )
  })
})

describe('grants', () => {
  it('keeps token columns and server-only tables away from authenticated', async () => {
    const priv = async (role: string, sql: string) =>
      (await db.query<{ ok: boolean }>(sql.replace('$ROLE', role))).rows[0].ok
    for (const col of ['refresh_token_enc', 'token_key_version']) {
      expect(
        await priv(
          'authenticated',
          `select has_column_privilege('$ROLE','public.ads_connections'::regclass,'${col}','SELECT') as ok`,
        ),
      ).toBe(false)
    }
    expect(
      await priv(
        'authenticated',
        `select has_column_privilege('$ROLE','public.ads_connections'::regclass,'status','SELECT') as ok`,
      ),
    ).toBe(true)
    for (const table of [
      'ads_usage_events',
      'ads_free_usage',
      'ads_alerts',
      'ads_free_reservations',
      'ads_google_oauth_flows',
      'ads_google_api_operations',
    ]) {
      expect(await priv('authenticated', `select has_table_privilege('$ROLE','public.${table}','SELECT') as ok`)).toBe(
        false,
      )
    }
  })

  it('exposes the RPCs to service_role only', async () => {
    const fns = [
      'ads_charge_credits(uuid,integer,text)',
      'ads_refund_credits(uuid,text)',
      'reserve_ads_free_actions(text,text[],integer[])',
      'release_ads_free_actions(text)',
      'ads_record_alert_once(text,jsonb)',
      'ads_purge_expired(integer,integer,integer,integer,integer,integer)',
      'ads_reserve_google_api_operation(uuid,uuid,uuid,text)',
    ]
    for (const fn of fns) {
      const { rows } = await db.query<{ a: boolean; u: boolean; s: boolean }>(
        `select has_function_privilege('anon','public.${fn}','EXECUTE') as a,
                has_function_privilege('authenticated','public.${fn}','EXECUTE') as u,
                has_function_privilege('service_role','public.${fn}','EXECUTE') as s`,
      )
      expect(rows[0]).toEqual({ a: false, u: false, s: true })
    }
  })
})
