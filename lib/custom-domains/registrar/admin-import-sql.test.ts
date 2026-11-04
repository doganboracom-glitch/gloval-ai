import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const HANDOVER_MIGRATION = readFileSync(path.join(ROOT, 'scripts/086-domain-ownership-handover.sql'), 'utf8')
const IMPORT_MIGRATION = readFileSync(path.join(ROOT, 'scripts/087-admin-domain-import.sql'), 'utf8')

const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid);
create table public.domain_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  domain text not null,
  tld text not null,
  period_years integer not null,
  status text not null,
  price_cents bigint not null,
  currency text not null,
  price_snapshot jsonb not null default '{}'::jsonb,
  provider_response jsonb,
  payment_provider text,
  provider_domain_id text,
  expires_at timestamptz,
  custom_domain_id text,
  created_at timestamptz not null default now()
);
create table public.domain_transfers (
  id uuid primary key default gen_random_uuid(), domain text not null, status text not null,
  created_at timestamptz not null default now(), custom_domain_id uuid
);
create table public.domain_renewals (
  id uuid primary key default gen_random_uuid(), domain text not null, status text not null,
  created_at timestamptz not null default now()
);
create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  domain text not null unique,
  provider text not null default 'domainnameapi',
  order_id uuid references public.domain_orders(id),
  status text not null default 'active',
  expires_at timestamptz,
  is_primary boolean not null default false,
  website_project_id uuid,
  email_enabled boolean not null default true,
  verified_at timestamptz,
  dns jsonb not null default '[]'::jsonb,
  verification_token text,
  mail_access_status text not null default 'active',
  mail_grace_started_at timestamptz,
  mail_grace_ends_at timestamptz,
  mail_quota_mb_per_box int,
  mail_access_sync_pending boolean not null default false,
  mail_access_sync_error text,
  vercel_status text,
  created_at timestamptz not null default now()
);
create unique index custom_domains_one_primary on public.custom_domains (user_id) where is_primary;
`

type RpcResult = {
  ok: boolean
  code?: string
  status?: string
  request_id?: string
  domain?: string
  order_id?: string
  custom_domain_id?: string
  requires_second_admin?: boolean
  replayed?: boolean
}

let db: PGlite
let userNumber = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(HANDOVER_MIGRATION)
  await db.exec(IMPORT_MIGRATION)
})

afterAll(async () => {
  await db.close()
})

async function newUser(email?: string) {
  userNumber += 1
  const { rows } = await db.query<{ id: string; email: string }>(
    `insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id, email`,
    [email ?? `admin-import-${userNumber}@example.net`],
  )
  return rows[0]
}

async function requestImport(input: {
  domain: string
  target: { id: string; email: string }
  actor: { id: string; email: string }
  key: string
}) {
  const expiresAt = '2099-01-01T00:00:00.000Z'
  const { rows } = await db.query<{ result: RpcResult }>(
    `select public.admin_request_domain_import(
       $1, $2, $3::uuid, $4, $5::uuid, $6, $7, $8, $9, $10::timestamptz,
       $11::text[], $12::jsonb, $13
     ) as result`,
    [
      input.domain,
      input.domain.slice(input.domain.lastIndexOf('.') + 1),
      input.target.id,
      input.target.email,
      input.actor.id,
      input.actor.email,
      'TKT-2026-119',
      input.key,
      input.domain,
      expiresAt,
      '{ns1.example.net,ns2.example.net}',
      '[]',
      '0123456789abcdef0123456789abcdef',
    ],
  )
  return rows[0].result
}

async function approveImport(requestId: string, actor: { id: string; email: string }, domain: string) {
  const { rows } = await db.query<{ result: RpcResult }>(
    `select public.admin_approve_domain_import(
       $1::uuid, $2::uuid, $3, $4, $5::timestamptz, $6::text[]
     ) as result`,
    [
      requestId,
      actor.id,
      actor.email,
      domain,
      '2099-01-02T00:00:00.000Z',
      '{ns1.example.net,ns2.example.net}',
    ],
  )
  return rows[0].result
}

async function rowCount(table: 'domain_orders' | 'custom_domains' | 'domain_handover_events', domain: string) {
  const column = table === 'domain_handover_events' ? 'domain' : 'domain'
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::text as count from public.${table} where ${column} = $1`,
    [domain],
  )
  return Number(rows[0].count)
}

describe('admin registrar domain import SQL', () => {
  it('atomically creates one active, zero-charge import and replays the same idempotency key', async () => {
    const target = await newUser('customer@example.net')
    const actor = await newUser('admin@example.net')
    const domain = 'owned-import.example.com'

    const first = await requestImport({ domain, target, actor, key: 'import-key-0001' })
    expect(first).toMatchObject({ ok: true, status: 'imported', requires_second_admin: false, replayed: false })
    expect(first.custom_domain_id).toBeTruthy()

    const [orders, domains, events] = await Promise.all([
      db.query<Record<string, unknown>>(`select * from public.domain_orders where domain = $1`, [domain]),
      db.query<Record<string, unknown>>(`select * from public.custom_domains where domain = $1`, [domain]),
      db.query<Record<string, unknown>>(
        `select * from public.domain_handover_events where domain = $1 and event = 'admin_imported'`,
        [domain],
      ),
    ])
    expect(orders.rows).toHaveLength(1)
    expect(orders.rows[0]).toMatchObject({
      user_id: target.id,
      status: 'active',
      payment_provider: 'admin_import',
      provider_domain_id: domain,
      price_cents: 0,
    })
    expect(orders.rows[0].price_snapshot).toMatchObject({ source: 'admin_import', sourceNote: 'TKT-2026-119' })
    expect(domains.rows).toHaveLength(1)
    expect(domains.rows[0]).toMatchObject({
      user_id: target.id,
      provider: 'domainnameapi',
      status: 'active',
      email_enabled: false,
      is_primary: true,
    })
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]).toMatchObject({
      actor_email: actor.email,
      to_user_id: target.id,
      event: 'admin_imported',
      reason: 'TKT-2026-119',
    })

    const replay = await requestImport({ domain, target, actor, key: 'import-key-0001' })
    expect(replay).toMatchObject({ ok: true, status: 'imported', replayed: true })
    expect(await rowCount('domain_orders', domain)).toBe(1)
    expect(await rowCount('custom_domains', domain)).toBe(1)
    expect(await rowCount('domain_handover_events', domain)).toBe(1)

    const duplicate = await requestImport({ domain, target, actor, key: 'import-key-0002' })
    expect(duplicate).toMatchObject({ ok: false, code: 'domain_exists' })
  })

  it('requires a different admin for enabled second-admin approval and rechecks the registrar snapshot', async () => {
    const target = await newUser('second-customer@example.net')
    const requester = await newUser('requester@example.net')
    const approver = await newUser('approver@example.net')
    await db.query(
      `insert into public.domain_handover_settings (id, require_second_admin)
       values (true, true)
       on conflict (id) do update set require_second_admin = true`,
    )
    const domain = 'second-import.example.com'

    const request = await requestImport({ domain, target, actor: requester, key: 'import-key-0003' })
    expect(request).toMatchObject({ ok: true, status: 'pending_approval', requires_second_admin: true })
    expect(await rowCount('domain_orders', domain)).toBe(0)
    expect(await rowCount('custom_domains', domain)).toBe(0)

    const selfApproval = await approveImport(request.request_id!, requester, domain)
    expect(selfApproval).toMatchObject({ ok: false, code: 'second_admin_required' })
    expect(await rowCount('domain_orders', domain)).toBe(0)

    const approved = await approveImport(request.request_id!, approver, domain)
    expect(approved).toMatchObject({ ok: true, status: 'imported', requires_second_admin: true, replayed: false })
    expect(await rowCount('domain_orders', domain)).toBe(1)
    expect(await rowCount('custom_domains', domain)).toBe(1)

    const replay = await approveImport(request.request_id!, approver, domain)
    expect(replay).toMatchObject({ ok: true, status: 'imported', replayed: true })
    expect(await rowCount('domain_handover_events', domain)).toBe(1)
  })

  it('records a rejection with a decision note and permits a new request afterward', async () => {
    const target = await newUser('reject-customer@example.net')
    const requester = await newUser('reject-requester@example.net')
    const reviewer = await newUser('reject-reviewer@example.net')
    await db.query(
      `update public.domain_handover_settings set require_second_admin = true where id = true`,
    )
    const domain = 'rejected-import.example.com'

    const request = await requestImport({ domain, target, actor: requester, key: 'import-key-0004' })
    const { rows } = await db.query<{ result: RpcResult }>(
      `select public.admin_reject_domain_import($1::uuid, $2::uuid, $3, $4) as result`,
      [request.request_id, reviewer.id, reviewer.email, 'Ticket not verified'],
    )
    expect(rows[0].result).toMatchObject({ ok: true })

    const { rows: requestRows } = await db.query<Record<string, unknown>>(
      `select status, decided_by_email, decision_note from public.domain_import_requests where id = $1::uuid`,
      [request.request_id],
    )
    expect(requestRows[0]).toMatchObject({
      status: 'rejected',
      decided_by_email: reviewer.email,
      decision_note: 'Ticket not verified',
    })

    const retried = await requestImport({ domain, target, actor: requester, key: 'import-key-0005' })
    expect(retried).toMatchObject({ ok: true, status: 'pending_approval' })
  })
})
