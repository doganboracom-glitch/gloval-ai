import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Executes scripts/086-domain-ownership-handover.sql (and its rollback) against an
 * in-process Postgres (PGlite) with a minimal stand-in for the production tables.
 * Nothing here talks to a real database.
 */

const ROOT = process.cwd()
const MIGRATION = readFileSync(path.join(ROOT, 'scripts/086-domain-ownership-handover.sql'), 'utf8')
const ROLLBACK = readFileSync(path.join(ROOT, 'scripts/086-domain-ownership-handover.rollback.sql'), 'utf8')

const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, email_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz);
create table public.projects (id uuid primary key default gen_random_uuid(), owner_id uuid);
create table public.domain_orders (
  id uuid primary key default gen_random_uuid(), user_id uuid, domain text not null,
  status text not null, created_at timestamptz not null default now());
create table public.domain_transfers (
  id uuid primary key default gen_random_uuid(), domain text not null, status text not null,
  created_at timestamptz not null default now(), custom_domain_id uuid);
create table public.domain_renewals (
  id uuid primary key default gen_random_uuid(), domain text not null, status text not null,
  created_at timestamptz not null default now());
create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, domain text not null unique,
  provider text not null default 'domainnameapi', order_id uuid,
  status text not null default 'active', expires_at timestamptz,
  is_primary boolean not null default false, website_project_id uuid,
  email_enabled boolean not null default true,
  mail_access_status text not null default 'active',
  mail_grace_started_at timestamptz, mail_grace_ends_at timestamptz,
  mail_quota_mb_per_box int, mail_access_sync_pending boolean not null default false,
  mail_access_sync_error text, vercel_status text,
  created_at timestamptz not null default now());
create unique index custom_domains_one_primary on public.custom_domains (user_id) where is_primary;
`

type Result = Record<string, unknown> & { ok: boolean; code?: string }

let db: PGlite
let counter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(MIGRATION)
})

afterAll(async () => {
  await db.close()
})

async function newUser(opts: { confirmed?: boolean; banned?: string | null; deleted?: boolean } = {}) {
  counter += 1
  const email = `user${counter}@example.com`
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, banned_until, deleted_at)
     values ($1, $2, $3, $4) returning id`,
    [
      email,
      opts.confirmed === false ? null : new Date().toISOString(),
      opts.banned ?? null,
      opts.deleted ? new Date().toISOString() : null,
    ],
  )
  return { id: rows[0].id, email }
}

async function newDomain(
  owner: string,
  opts: {
    name?: string
    primary?: boolean
    status?: string
    provider?: string
    withOrder?: boolean
    orderStatus?: string
    orderDomain?: string
    orderUser?: string | null
    expiresAt?: string | null
    createdAt?: string
    projectId?: string | null
    emailEnabled?: boolean
  } = {},
) {
  counter += 1
  const name = opts.name ?? `example${counter}.com`
  let orderId: string | null = null
  if (opts.withOrder !== false) {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.domain_orders (user_id, domain, status) values ($1, $2, $3) returning id`,
      [opts.orderUser === undefined ? owner : opts.orderUser, opts.orderDomain ?? name, opts.orderStatus ?? 'active'],
    )
    orderId = rows[0].id
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into public.custom_domains
       (user_id, domain, provider, order_id, status, expires_at, is_primary, created_at,
        website_project_id, email_enabled, mail_quota_mb_per_box)
     values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()),$9,$10,2048) returning id`,
    [
      owner,
      name,
      opts.provider ?? 'domainnameapi',
      orderId,
      opts.status ?? 'active',
      opts.expiresAt === undefined ? null : opts.expiresAt,
      opts.primary ?? false,
      opts.createdAt ?? null,
      opts.projectId ?? null,
      opts.emailEnabled ?? true,
    ],
  )
  return { id: rows[0].id, name, orderId }
}

const WAIVER = { giver_waiver_confirmed: true, giver_waiver_ticket: 'TKT-1001' }

type HandoverArgs = {
  domainId: string
  from: string
  to: { id: string; email: string }
  actor?: string
  reason?: string
  key?: string
  meta?: unknown
  toEmail?: string
}

async function handover(a: HandoverArgs): Promise<Result> {
  counter += 1
  const { rows } = await db.query<{ r: Result }>(
    `select public.handover_registrar_domain($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::jsonb) as r`,
    [
      a.domainId,
      a.from,
      a.to.id,
      a.toEmail ?? a.to.email,
      a.actor ?? 'admin1@gloval.ai',
      a.reason ?? 'Support ticket TKT-1001 approved handover',
      a.key ?? `key-${counter}`,
      JSON.stringify(a.meta === undefined ? WAIVER : a.meta),
    ],
  )
  return rows[0].r
}

async function setup(opts: Parameters<typeof newDomain>[1] = {}) {
  const from = await newUser()
  const to = await newUser()
  const dom = await newDomain(from.id, opts)
  return { from, to, dom }
}

async function domainRow(id: string) {
  const { rows } = await db.query<Record<string, unknown>>(`select * from public.custom_domains where id = $1`, [id])
  return rows[0]
}

async function events(handoverId: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    `select * from public.domain_handover_events where handover_id = $1 order by created_at, id`,
    [handoverId],
  )
  return rows
}

describe('giver waiver', () => {
  it('refuses a handover without any waiver (giver_waiver_required)', async () => {
    const { from, to, dom } = await setup()
    const res = await handover({ domainId: dom.id, from: from.id, to, meta: {} })
    expect(res).toMatchObject({ ok: false, code: 'giver_waiver_required' })
    expect((await domainRow(dom.id)).user_id).toBe(from.id)
  })

  it('refuses giver_waiver_confirmed = false', async () => {
    const { from, to, dom } = await setup()
    const res = await handover({ domainId: dom.id, from: from.id, to, meta: { ...WAIVER, giver_waiver_confirmed: false } })
    expect(res).toMatchObject({ ok: false, code: 'giver_waiver_required' })
  })

  it('refuses the string "true" (only the JSON boolean counts)', async () => {
    const { from, to, dom } = await setup()
    const res = await handover({ domainId: dom.id, from: from.id, to, meta: { ...WAIVER, giver_waiver_confirmed: 'true' } })
    expect(res).toMatchObject({ ok: false, code: 'giver_waiver_required' })
  })

  it('refuses a null / non-object meta', async () => {
    const { from, to, dom } = await setup()
    expect(await handover({ domainId: dom.id, from: from.id, to, meta: null })).toMatchObject({
      ok: false,
      code: 'giver_waiver_required',
    })
    expect(await handover({ domainId: dom.id, from: from.id, to, meta: [true] })).toMatchObject({
      ok: false,
      code: 'giver_waiver_required',
    })
  })

  it('refuses a missing, blank or too-short ticket (giver_waiver_ticket_required)', async () => {
    const { from, to, dom } = await setup()
    for (const ticket of [undefined, '', '   ', 'ab']) {
      const meta = ticket === undefined ? { giver_waiver_confirmed: true } : { giver_waiver_confirmed: true, giver_waiver_ticket: ticket }
      expect(await handover({ domainId: dom.id, from: from.id, to, meta })).toMatchObject({
        ok: false,
        code: 'giver_waiver_ticket_required',
      })
    }
    const tooLong = 'x'.repeat(65)
    expect(
      await handover({ domainId: dom.id, from: from.id, to, meta: { ...WAIVER, giver_waiver_ticket: tooLong } }),
    ).toMatchObject({ ok: false, code: 'giver_waiver_ticket_required' })
  })

  it('writes the waiver into the audit snapshot and the result', async () => {
    const { from, to, dom } = await setup()
    const res = await handover({ domainId: dom.id, from: from.id, to, actor: 'Admin1@Gloval.ai ' })
    expect(res.ok).toBe(true)
    expect(res.giver_waiver).toMatchObject({ confirmed: true, ticket: 'TKT-1001', confirmed_by: 'Admin1@Gloval.ai' })
    const [row] = await events(res.handover_id as string)
    const snapshot = row.snapshot as { giver_waiver: { confirmed: boolean; ticket: string }; meta: Record<string, unknown> }
    expect(snapshot.giver_waiver).toMatchObject({ confirmed: true, ticket: 'TKT-1001' })
    expect(snapshot.meta).toEqual({})
  })

  it('keeps unrelated meta alongside the waiver', async () => {
    const { from, to, dom } = await setup()
    const res = await handover({ domainId: dom.id, from: from.id, to, meta: { ...WAIVER, mailbox_count: 3 } })
    expect(res.ok).toBe(true)
    expect(res.meta).toEqual({ mailbox_count: 3 })
  })

  it('does not change anything when the waiver is missing even though all other rules pass', async () => {
    const { from, to, dom } = await setup({ primary: true })
    await handover({ domainId: dom.id, from: from.id, to, meta: {} })
    const row = await domainRow(dom.id)
    expect(row).toMatchObject({ user_id: from.id, is_primary: true, mail_transfer_hold_at: null })
  })

  it('a replay of a recorded handover is still idempotent without re-sending the waiver', async () => {
    const { from, to, dom } = await setup()
    const first = await handover({ domainId: dom.id, from: from.id, to, key: 'replay-waiver' })
    const again = await handover({ domainId: dom.id, from: from.id, to, key: 'replay-waiver', meta: {} })
    expect(again).toMatchObject({ ok: true, replayed: true, handover_id: first.handover_id })
  })
})

describe('handover preconditions', () => {
  it('bad_request for empty key/actor and short reason', async () => {
    const { from, to, dom } = await setup()
    expect(await handover({ domainId: dom.id, from: from.id, to, key: '  ' })).toMatchObject({ code: 'bad_request' })
    expect(await handover({ domainId: dom.id, from: from.id, to, key: 'k'.repeat(81) })).toMatchObject({ code: 'bad_request' })
    expect(await handover({ domainId: dom.id, from: from.id, to, actor: ' ' })).toMatchObject({ code: 'bad_request' })
    expect(await handover({ domainId: dom.id, from: from.id, to, reason: 'too short' })).toMatchObject({ code: 'bad_request' })
    expect(await handover({ domainId: dom.id, from: from.id, to, reason: '          ' })).toMatchObject({ code: 'bad_request' })
  })

  it('domain_not_found, owner_changed, already_owned_by_target', async () => {
    const { from, to, dom } = await setup()
    expect(
      await handover({ domainId: '00000000-0000-0000-0000-000000000000', from: from.id, to }),
    ).toMatchObject({ code: 'domain_not_found' })
    const other = await newUser()
    expect(await handover({ domainId: dom.id, from: other.id, to })).toMatchObject({ code: 'owner_changed' })
    expect(await handover({ domainId: dom.id, from: from.id, to: { id: from.id, email: from.email } })).toMatchObject({
      code: 'already_owned_by_target',
    })
  })

  it('target user rules', async () => {
    const { from, dom } = await setup()
    const ghost = { id: '00000000-0000-0000-0000-000000000001', email: 'ghost@example.com' }
    expect(await handover({ domainId: dom.id, from: from.id, to: ghost })).toMatchObject({ code: 'target_not_found' })
    const deleted = await newUser({ deleted: true })
    expect(await handover({ domainId: dom.id, from: from.id, to: deleted })).toMatchObject({ code: 'target_not_found' })
    const target = await newUser()
    expect(await handover({ domainId: dom.id, from: from.id, to: target, toEmail: 'wrong@example.com' })).toMatchObject({
      code: 'target_email_mismatch',
    })
    const unconfirmed = await newUser({ confirmed: false })
    expect(await handover({ domainId: dom.id, from: from.id, to: unconfirmed })).toMatchObject({ code: 'target_unconfirmed' })
    const banned = await newUser({ banned: new Date(Date.now() + 86_400_000).toISOString() })
    expect(await handover({ domainId: dom.id, from: from.id, to: banned })).toMatchObject({ code: 'target_banned' })
  })

  it('accepts an e-mail that differs only by case/whitespace and a lapsed ban', async () => {
    const { from, dom } = await setup()
    const lapsed = await newUser({ banned: new Date(Date.now() - 86_400_000).toISOString() })
    const res = await handover({ domainId: dom.id, from: from.id, to: lapsed, toEmail: `  ${lapsed.email.toUpperCase()} ` })
    expect(res.ok).toBe(true)
  })

  it('domain rules: provider, order, status, expiry', async () => {
    const a = await setup({ provider: 'other' })
    expect(await handover({ domainId: a.dom.id, from: a.from.id, to: a.to })).toMatchObject({ code: 'not_registrar_domain' })
    const b = await setup({ withOrder: false })
    expect(await handover({ domainId: b.dom.id, from: b.from.id, to: b.to })).toMatchObject({ code: 'no_order' })
    for (const status of ['pending', 'verifying', 'failed', 'disabled']) {
      const c = await setup({ status })
      expect(await handover({ domainId: c.dom.id, from: c.from.id, to: c.to })).toMatchObject({ code: 'domain_not_active' })
    }
    const d = await setup({ expiresAt: new Date(Date.now() - 86_400_000).toISOString() })
    expect(await handover({ domainId: d.dom.id, from: d.from.id, to: d.to })).toMatchObject({ code: 'domain_expired' })
  })

  it('order rules: not active, domain mismatch, owner mismatch (NULL order owner is fine)', async () => {
    const a = await setup({ orderStatus: 'pending_payment' })
    expect(await handover({ domainId: a.dom.id, from: a.from.id, to: a.to })).toMatchObject({ code: 'order_not_active' })
    const b = await setup({ orderDomain: 'different-name.com' })
    expect(await handover({ domainId: b.dom.id, from: b.from.id, to: b.to })).toMatchObject({ code: 'order_domain_mismatch' })
    const stranger = await newUser()
    const c = await setup({ orderUser: stranger.id })
    expect(await handover({ domainId: c.dom.id, from: c.from.id, to: c.to })).toMatchObject({ code: 'order_owner_mismatch' })
    const d = await setup({ orderUser: null })
    expect((await handover({ domainId: d.dom.id, from: d.from.id, to: d.to })).ok).toBe(true)
  })
})

describe('open jobs', () => {
  async function insertJob(table: 'domain_orders' | 'domain_transfers' | 'domain_renewals', name: string, status: string, ageHours = 0) {
    const created = new Date(Date.now() - ageHours * 3_600_000).toISOString()
    if (table === 'domain_orders') {
      await db.query(`insert into public.domain_orders (domain, status, created_at) values ($1,$2,$3)`, [name, status, created])
    } else {
      await db.query(`insert into public.${table} (domain, status, created_at) values ($1,$2,$3)`, [name, status, created])
    }
  }

  it.each([
    ['domain_orders', ['pending_payment', 'payment_verified', 'registration_pending']],
    ['domain_transfers', ['pending_payment', 'payment_verified', 'transfer_submitting', 'transfer_pending']],
    [
      'domain_renewals',
      ['pending_payment', 'payment_verified', 'renewal_submitting', 'renewal_reconciliation_required', 'manual_refund_required'],
    ],
  ] as const)('%s: every open status blocks the handover', async (table, statuses) => {
    for (const status of statuses) {
      const { from, to, dom } = await setup()
      await insertJob(table, dom.name, status)
      const res = await handover({ domainId: dom.id, from: from.id, to })
      expect(res, `${table}/${status}`).toMatchObject({ ok: false, code: 'open_job' })
    }
  })

  it.each([
    ['domain_orders', ['active', 'registration_failed', 'failed', 'cancelled']],
    ['domain_transfers', ['completed', 'failed', 'cancelled']],
    ['domain_renewals', ['completed', 'failed', 'cancelled']],
  ] as const)('%s: terminal statuses do not block', async (table, statuses) => {
    for (const status of statuses) {
      const { from, to, dom } = await setup()
      await insertJob(table, dom.name, status)
      const res = await handover({ domainId: dom.id, from: from.id, to })
      expect(res.ok, `${table}/${status}`).toBe(true)
    }
  })

  it('a pending_payment older than 2 hours is abandoned; a fresh one blocks', async () => {
    for (const table of ['domain_orders', 'domain_transfers', 'domain_renewals'] as const) {
      const old = await setup()
      await insertJob(table, old.dom.name, 'pending_payment', 3)
      expect((await handover({ domainId: old.dom.id, from: old.from.id, to: old.to })).ok, table).toBe(true)
      const fresh = await setup()
      await insertJob(table, fresh.dom.name, 'pending_payment', 1)
      expect(await handover({ domainId: fresh.dom.id, from: fresh.from.id, to: fresh.to }), table).toMatchObject({
        code: 'open_job',
      })
    }
  })

  it('reports the three counts separately and ignores other users/domains', async () => {
    const { from, to, dom } = await setup()
    await insertJob('domain_orders', dom.name, 'payment_verified')
    await insertJob('domain_transfers', dom.name, 'transfer_pending')
    await insertJob('domain_transfers', dom.name, 'transfer_submitting')
    await insertJob('domain_renewals', dom.name, 'payment_verified')
    await insertJob('domain_renewals', 'unrelated.example', 'payment_verified')
    const res = await handover({ domainId: dom.id, from: from.id, to })
    expect(res).toMatchObject({ code: 'open_job', open_orders: 1, open_transfers: 2, open_renewals: 1 })
  })
})

describe('handover effects', () => {
  it('moves ownership, clears website/e-mail, starts the quarantine and logs one audit row', async () => {
    const project = await db.query<{ id: string }>(`insert into public.projects (owner_id) values (gen_random_uuid()) returning id`)
    const { from, to, dom } = await setup({ primary: true, projectId: project.rows[0].id })
    const res = await handover({ domainId: dom.id, from: from.id, to })
    expect(res).toMatchObject({ ok: true, replayed: false })
    const row = await domainRow(dom.id)
    expect(row).toMatchObject({
      user_id: to.id,
      website_project_id: null,
      email_enabled: false,
      mail_quota_mb_per_box: null,
      mail_access_status: 'suspended',
      mail_grace_started_at: null,
      mail_grace_ends_at: null,
      mail_access_sync_pending: true,
      mail_access_sync_error: null,
      mail_transfer_hold_handover_id: res.handover_id,
    })
    expect(row.mail_transfer_hold_at).not.toBeNull()
    const order = await db.query<{ user_id: string; status: string }>(
      `select user_id, status from public.domain_orders where id = $1`,
      [dom.orderId],
    )
    expect(order.rows[0]).toMatchObject({ user_id: from.id, status: 'active' })
    const log = await events(res.handover_id as string)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ event: 'handover', actor_email: 'admin1@gloval.ai' })
    expect((log[0].snapshot as { before: { is_primary: boolean } }).before.is_primary).toBe(true)
  })

  it('idempotency: same key + params replays, different params is a key reuse, new key finds the domain already moved', async () => {
    const { from, to, dom } = await setup()
    const first = await handover({ domainId: dom.id, from: from.id, to, key: 'idem-1' })
    const again = await handover({ domainId: dom.id, from: from.id, to, key: 'idem-1' })
    expect(again).toMatchObject({ ok: true, replayed: true, handover_id: first.handover_id })
    const other = await newUser()
    expect(await handover({ domainId: dom.id, from: from.id, to: other, key: 'idem-1' })).toMatchObject({
      code: 'idempotency_key_reuse',
    })
    expect(await handover({ domainId: dom.id, from: from.id, to, key: 'idem-2' })).toMatchObject({
      code: 'already_owned_by_target',
    })
    expect(await events(first.handover_id as string)).toHaveLength(1)
  })

  it('is atomic: a failing audit insert rolls the whole handover back', async () => {
    const { from, to, dom } = await setup({ primary: true })
    await db.exec(`
      create function public._test_fail() returns trigger language plpgsql as $$ begin raise exception 'forced_audit_failure'; end $$;
      create trigger _test_fail before insert on public.domain_handover_events for each row execute function public._test_fail();`)
    try {
      await expect(handover({ domainId: dom.id, from: from.id, to })).rejects.toThrow(/forced_audit_failure/)
    } finally {
      await db.exec(`drop trigger _test_fail on public.domain_handover_events; drop function public._test_fail();`)
    }
    expect(await domainRow(dom.id)).toMatchObject({ user_id: from.id, is_primary: true, mail_transfer_hold_at: null })
  })
})

describe('primary domain rules', () => {
  it('giver loses the primary: its oldest ACTIVE domain is promoted (pending ones lose)', async () => {
    const from = await newUser()
    const to = await newUser()
    const moved = await newDomain(from.id, { primary: true, createdAt: '2025-01-03T00:00:00Z' })
    const oldestPending = await newDomain(from.id, { status: 'pending', createdAt: '2025-01-01T00:00:00Z' })
    const oldestActive = await newDomain(from.id, { createdAt: '2025-01-02T00:00:00Z' })
    const newer = await newDomain(from.id, { createdAt: '2025-02-01T00:00:00Z' })
    const res = await handover({ domainId: moved.id, from: from.id, to })
    expect(res.old_owner_promoted_id).toBe(oldestActive.id)
    expect((await domainRow(oldestActive.id)).is_primary).toBe(true)
    expect((await domainRow(oldestPending.id)).is_primary).toBe(false)
    expect((await domainRow(newer.id)).is_primary).toBe(false)
    // The receiver owns nothing else, so the received domain becomes ITS primary.
    expect(await domainRow(moved.id)).toMatchObject({ user_id: to.id, is_primary: true })
  })

  it('ties on created_at are broken deterministically by id', async () => {
    const from = await newUser()
    const to = await newUser()
    const moved = await newDomain(from.id, { primary: true, createdAt: '2025-03-01T00:00:00Z' })
    const a = await newDomain(from.id, { createdAt: '2025-01-01T00:00:00Z' })
    const b = await newDomain(from.id, { createdAt: '2025-01-01T00:00:00Z' })
    const res = await handover({ domainId: moved.id, from: from.id, to })
    expect(res.old_owner_promoted_id).toBe([a.id, b.id].sort()[0])
  })

  it('giver with a single domain ends with no primary and no error', async () => {
    const { from, to, dom } = await setup({ primary: true })
    const res = await handover({ domainId: dom.id, from: from.id, to })
    expect(res.ok).toBe(true)
    expect(res.old_owner_promoted_id).toBeNull()
    const { rows } = await db.query(`select 1 from public.custom_domains where user_id = $1 and is_primary`, [from.id])
    expect(rows).toHaveLength(0)
  })

  it('a non-primary domain leaves the giver primary untouched', async () => {
    const from = await newUser()
    const to = await newUser()
    const keep = await newDomain(from.id, { primary: true })
    const moved = await newDomain(from.id)
    const res = await handover({ domainId: moved.id, from: from.id, to })
    expect(res.old_owner_promoted_id).toBeNull()
    expect((await domainRow(keep.id)).is_primary).toBe(true)
  })

  it('receiver keeps its existing primary; the received domain never becomes primary', async () => {
    const from = await newUser()
    const to = await newUser()
    const theirs = await newDomain(to.id, { primary: true })
    const moved = await newDomain(from.id, { primary: true })
    const res = await handover({ domainId: moved.id, from: from.id, to })
    expect(res.new_owner_promoted_id).toBeNull()
    expect((await domainRow(theirs.id)).is_primary).toBe(true)
    expect((await domainRow(moved.id)).is_primary).toBe(false)
  })

  it('receiver with no domains gets the received one as primary; receiver without a primary gets its oldest', async () => {
    const a = await setup({ primary: true })
    const resA = await handover({ domainId: a.dom.id, from: a.from.id, to: a.to })
    expect(resA.new_owner_promoted_id).toBe(a.dom.id)
    expect((await domainRow(a.dom.id)).is_primary).toBe(true)

    const from = await newUser()
    const to = await newUser()
    const oldest = await newDomain(to.id, { createdAt: '2024-01-01T00:00:00Z' })
    await newDomain(to.id, { createdAt: '2024-06-01T00:00:00Z' })
    const moved = await newDomain(from.id, { primary: true })
    const resB = await handover({ domainId: moved.id, from: from.id, to })
    expect(resB.new_owner_promoted_id).toBe(oldest.id)
  })

  it('every user ends with at most one primary', async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from (select user_id from public.custom_domains where is_primary group by user_id having count(*) > 1) t`,
    )
    expect(rows[0].n).toBe('0')
  })
})

describe('quarantine guard and permissions', () => {
  it('forces e-mail off while quarantined and blocks clearing the flag outside the release function', async () => {
    const { from, to, dom } = await setup()
    await handover({ domainId: dom.id, from: from.id, to })
    await db.query(`update public.custom_domains set email_enabled = true, mail_access_status = 'active' where id = $1`, [dom.id])
    expect(await domainRow(dom.id)).toMatchObject({ email_enabled: false, mail_access_status: 'suspended' })
    await expect(
      db.query(`update public.custom_domains set mail_transfer_hold_at = null where id = $1`, [dom.id]),
    ).rejects.toThrow(/mail_transfer_hold_release_forbidden/)
  })

  it('the audit table is append-only', async () => {
    const { from, to, dom } = await setup()
    await handover({ domainId: dom.id, from: from.id, to })
    await expect(db.query(`delete from public.domain_handover_events`)).rejects.toThrow(/append-only/)
    await expect(db.query(`update public.domain_handover_events set reason = 'x'`)).rejects.toThrow(/append-only/)
    await expect(db.exec(`truncate public.domain_handover_events`)).rejects.toThrow(/append-only/)
  })

  it.each(['anon', 'authenticated'])('%s can neither call the functions nor read the tables', async (role) => {
    const sql = [
      `select public.handover_registrar_domain(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'a@b.c', 'a@b.c', 'long enough reason', 'k', '{}')`,
      `select public.request_domain_mail_hold_release(gen_random_uuid(), gen_random_uuid(), 'a@b.c', 'empty_handover', null)`,
      `select public.release_domain_mail_transfer_hold(gen_random_uuid(), gen_random_uuid(), 'a@b.c', 'x.com', true, 'empty_handover', null, 'k', '{}')`,
      `select public.log_domain_handover_event(gen_random_uuid(), 'notice_sent', 'a@b.c', '{}')`,
      `select public._ensure_user_primary(gen_random_uuid())`,
      `select * from public.domain_handover_events`,
      `select * from public.domain_handover_settings`,
    ]
    await db.exec(`set role ${role}`)
    try {
      for (const q of sql) await expect(db.query(q), q).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('service_role may call the public functions but never the internal helper', async () => {
    await db.exec('set role service_role')
    try {
      await expect(db.query(`select public._ensure_user_primary(gen_random_uuid())`)).rejects.toThrow(/permission denied/)
      const { rows } = await db.query<{ r: Result }>(
        `select public.release_domain_mail_transfer_hold(gen_random_uuid(), gen_random_uuid(), 'a@b.c', 'x.com', true, 'empty_handover', null, 'svc-k', '{}') as r`,
      )
      expect(rows[0].r.code).toBe('domain_not_found')
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('quarantine release', () => {
  async function held() {
    const base = await setup()
    const res = await handover({ domainId: base.dom.id, from: base.from.id, to: base.to })
    return { ...base, handoverId: res.handover_id as string }
  }

  async function release(
    h: { dom: { id: string; name: string }; handoverId: string },
    o: {
      actor?: string
      confirm?: string
      ack?: boolean | null
      mode?: string | null
      note?: string | null
      key?: string
      meta?: unknown
    } = {},
  ): Promise<Result> {
    counter += 1
    const { rows } = await db.query<{ r: Result }>(
      `select public.release_domain_mail_transfer_hold($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb) as r`,
      [
        h.dom.id,
        h.handoverId,
        o.actor ?? 'admin1@gloval.ai',
        o.confirm ?? h.dom.name,
        o.ack === undefined ? true : o.ack,
        o.mode === undefined ? 'empty_handover' : o.mode,
        o.note === undefined ? null : o.note,
        o.key ?? `rel-${counter}`,
        JSON.stringify(
          o.meta === undefined ? { mailbox_count: 0, mailbox_count_checked_at: new Date().toISOString() } : o.meta,
        ),
      ],
    )
    return rows[0].r
  }

  it('rejects bad input and wrong state', async () => {
    const h = await held()
    expect(await release(h, { key: ' ' })).toMatchObject({ code: 'bad_request' })
    expect(await release(h, { mode: null })).toMatchObject({ code: 'bad_release_mode' })
    expect(await release(h, { mode: 'whatever' })).toMatchObject({ code: 'bad_release_mode' })
    expect(await release(h, { confirm: 'other.com' })).toMatchObject({ code: 'confirm_mismatch' })
    expect(await release(h, { ack: false })).toMatchObject({ code: 'ack_required' })
    expect(await release(h, { ack: null })).toMatchObject({ code: 'ack_required' })
    expect(await release({ ...h, handoverId: '00000000-0000-0000-0000-000000000009' })).toMatchObject({ code: 'handover_mismatch' })
    const free = await setup()
    expect(await release({ dom: free.dom, handoverId: '00000000-0000-0000-0000-000000000009' })).toMatchObject({ code: 'not_held' })
  })

  it('empty_handover: mailbox count must be a fresh 0', async () => {
    const h = await held()
    const fresh = new Date().toISOString()
    expect(await release(h, { meta: {} })).toMatchObject({ code: 'mailbox_count_unknown' })
    expect(await release(h, { meta: { mailbox_count: null, mailbox_count_checked_at: fresh } })).toMatchObject({ code: 'mailbox_count_unknown' })
    expect(await release(h, { meta: { mailbox_count: -1, mailbox_count_checked_at: fresh } })).toMatchObject({ code: 'mailbox_count_unknown' })
    expect(await release(h, { meta: { mailbox_count: 'abc', mailbox_count_checked_at: fresh } })).toMatchObject({ code: 'mailbox_count_unknown' })
    expect(await release(h, { meta: { mailbox_count: 12345678901, mailbox_count_checked_at: fresh } })).toMatchObject({ code: 'mailbox_count_unknown' })
    expect(await release(h, { meta: { mailbox_count: 2, mailbox_count_checked_at: fresh } })).toMatchObject({
      code: 'mailboxes_not_cleared',
      mailbox_count: 2,
    })
    expect(await release(h, { meta: { mailbox_count: 0 } })).toMatchObject({ code: 'mailbox_count_stale' })
    expect(await release(h, { meta: { mailbox_count: 0, mailbox_count_checked_at: 'not a date' } })).toMatchObject({ code: 'mailbox_count_stale' })
    expect(
      await release(h, { meta: { mailbox_count: 0, mailbox_count_checked_at: new Date(Date.now() - 11 * 60_000).toISOString() } }),
    ).toMatchObject({ code: 'mailbox_count_stale' })
    expect(
      await release(h, { meta: { mailbox_count: 0, mailbox_count_checked_at: new Date(Date.now() + 5 * 60_000).toISOString() } }),
    ).toMatchObject({ code: 'mailbox_count_stale' })
    expect((await domainRow(h.dom.id)).mail_transfer_hold_at).not.toBeNull()
  })

  it('empty_handover with a fresh 0 releases the quarantine, queues a sync and audits the mode', async () => {
    const h = await held()
    const res = await release(h, { key: 'rel-ok' })
    expect(res).toMatchObject({ ok: true, replayed: false, release_mode: 'empty_handover' })
    expect(await domainRow(h.dom.id)).toMatchObject({
      mail_transfer_hold_at: null,
      mail_transfer_hold_handover_id: null,
      mail_access_sync_pending: true,
      email_enabled: false,
    })
    const log = (await events(h.handoverId)).find((e) => e.event === 'hold_released')
    expect(log).toMatchObject({ release_mode: 'empty_handover', consent_note: null, reason: 'hold_release:empty_handover' })
    expect(await release(h, { key: 'rel-ok' })).toMatchObject({ ok: true, replayed: true })
    expect(await release(h, { key: 'rel-new' })).toMatchObject({ code: 'not_held' })
  })

  it('keep_mailboxes_with_consent: needs a note of at least 10 characters after trimming', async () => {
    const h = await held()
    const meta = {}
    for (const note of [null, '', '         ', '123456789', '   123456789   ']) {
      expect(await release(h, { mode: 'keep_mailboxes_with_consent', note, meta })).toMatchObject({ code: 'consent_note_required' })
    }
    const ok = await release(h, { mode: 'keep_mailboxes_with_consent', note: '  Written consent, ticket TKT-1001  ', meta, key: 'keep-ok' })
    expect(ok).toMatchObject({ ok: true, release_mode: 'keep_mailboxes_with_consent' })
    const log = (await events(h.handoverId)).find((e) => e.event === 'hold_released')
    expect(log).toMatchObject({ release_mode: 'keep_mailboxes_with_consent', consent_note: 'Written consent, ticket TKT-1001' })
  })

  it('the audit table itself refuses a consent release without a proper note or mode', async () => {
    const h = await held()
    await expect(
      db.query(
        `insert into public.domain_handover_events
           (handover_id, event, custom_domain_id, domain, actor_email, release_mode, consent_note)
         values ($1, 'hold_released', $2, 'x.com', 'a@b.c', 'keep_mailboxes_with_consent', 'short')`,
        [h.handoverId, h.dom.id],
      ),
    ).rejects.toThrow(/dhe_consent_note_chk/)
    await expect(
      db.query(
        `insert into public.domain_handover_events (handover_id, event, custom_domain_id, domain, actor_email)
         values ($1, 'hold_released', $2, 'x.com', 'a@b.c')`,
        [h.handoverId, h.dom.id],
      ),
    ).rejects.toThrow(/dhe_release_has_mode/)
  })

  describe('optional second admin (default off)', () => {
    const setSecond = (on: boolean) => db.query(`update public.domain_handover_settings set require_second_admin = $1 where id`, [on])

    it('is off by default', async () => {
      const { rows } = await db.query<{ require_second_admin: boolean }>(`select require_second_admin from public.domain_handover_settings`)
      expect(rows[0].require_second_admin).toBe(false)
    })

    async function req(h: { dom: { id: string }; handoverId: string }, actor: string, mode = 'empty_handover', note: string | null = null) {
      const { rows } = await db.query<{ r: Result }>(
        `select public.request_domain_mail_hold_release($1::uuid,$2::uuid,$3,$4,$5) as r`,
        [h.dom.id, h.handoverId, actor, mode, note],
      )
      return rows[0].r
    }

    it('request validation', async () => {
      const h = await held()
      expect(await req(h, ' ')).toMatchObject({ code: 'bad_request' })
      expect(await req(h, 'a@b.c', 'nope')).toMatchObject({ code: 'bad_release_mode' })
      expect(await req(h, 'a@b.c', 'keep_mailboxes_with_consent', 'short')).toMatchObject({ code: 'consent_note_required' })
      const free = await setup()
      expect(await req({ dom: free.dom, handoverId: h.handoverId }, 'a@b.c')).toMatchObject({ code: 'not_held' })
      expect(await req({ dom: h.dom, handoverId: '00000000-0000-0000-0000-000000000009' }, 'a@b.c')).toMatchObject({
        code: 'handover_mismatch',
      })
    })

    it('when on: needs a request from a DIFFERENT admin, matching mode/note, within 24h', async () => {
      const h = await held()
      await setSecond(true)
      try {
        expect(await release(h, { key: 'sa-1' })).toMatchObject({ code: 'second_admin_required' })
        expect(await req(h, 'Admin1@gloval.ai')).toMatchObject({ ok: true })
        expect(await release(h, { actor: ' admin1@GLOVAL.ai', key: 'sa-2' })).toMatchObject({ code: 'second_admin_same_person' })
        expect(
          await release(h, { actor: 'admin2@gloval.ai', mode: 'keep_mailboxes_with_consent', note: 'Written consent from owner', meta: {}, key: 'sa-3' }),
        ).toMatchObject({ code: 'request_mismatch' })
        const done = await release(h, { actor: 'admin2@gloval.ai', key: 'sa-4' })
        expect(done).toMatchObject({ ok: true })
        const log = (await events(h.handoverId)).find((e) => e.event === 'hold_released')
        expect((log!.snapshot as Record<string, unknown>).second_admin_requested_by).toBe('Admin1@gloval.ai')
      } finally {
        await setSecond(false)
      }
    })

    it('when on: consent note must match the request; an old request expires', async () => {
      const h = await held()
      await setSecond(true)
      try {
        await req(h, 'admin1@gloval.ai', 'keep_mailboxes_with_consent', 'Written consent from owner')
        expect(
          await release(h, { actor: 'admin2@gloval.ai', mode: 'keep_mailboxes_with_consent', note: 'A different note entirely', meta: {}, key: 'sb-1' }),
        ).toMatchObject({ code: 'request_mismatch' })
        await db.exec(`alter table public.domain_handover_events disable trigger dhe_no_update_delete`)
        await db.query(
          `update public.domain_handover_events set created_at = now() - interval '25 hours' where handover_id = $1 and event = 'release_requested'`,
          [h.handoverId],
        )
        await db.exec(`alter table public.domain_handover_events enable trigger dhe_no_update_delete`)
        expect(
          await release(h, { actor: 'admin2@gloval.ai', mode: 'keep_mailboxes_with_consent', note: 'Written consent from owner', meta: {}, key: 'sb-2' }),
        ).toMatchObject({ code: 'second_admin_required' })
      } finally {
        await setSecond(false)
      }
    })

    it('fails closed when the settings row is missing', async () => {
      const h = await held()
      await db.exec(`delete from public.domain_handover_settings`)
      try {
        expect(await release(h, { key: 'fc-1' })).toMatchObject({ code: 'second_admin_required' })
      } finally {
        await db.exec(`insert into public.domain_handover_settings (id, require_second_admin) values (true, false)`)
      }
    })
  })
})

describe('rollback script', () => {
  it('refuses while audit rows or quarantined domains exist, then removes everything', async () => {
    const own = new PGlite()
    await own.exec(BASE_SCHEMA)
    await own.exec(MIGRATION)
    await own.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('11111111-1111-1111-1111-111111111111','a@x.com',now()),
        ('22222222-2222-2222-2222-222222222222','b@x.com',now());
      insert into public.domain_orders (id, user_id, domain, status)
        values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','r.com','active');
      insert into public.custom_domains (id, user_id, domain, order_id)
        values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','r.com','33333333-3333-3333-3333-333333333333');`)
    await own.query(
      `select public.handover_registrar_domain('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','b@x.com','admin@x.com','long enough reason','rb-1',$1::jsonb)`,
      [JSON.stringify(WAIVER)],
    )
    await expect(own.exec(ROLLBACK)).rejects.toThrow(/Audit rows exist/)
    await own.exec('rollback')
    await own.exec(`select set_config('app.confirm_drop_handover_audit', 'yes', false)`)
    await expect(own.exec(ROLLBACK)).rejects.toThrow(/still quarantined/)
    await own.exec('rollback')
    await own.exec(`alter table public.custom_domains disable trigger custom_domains_mail_hold_guard;
                    update public.custom_domains set mail_transfer_hold_at = null, mail_transfer_hold_handover_id = null;
                    alter table public.custom_domains enable trigger custom_domains_mail_hold_guard;`)
    await own.exec(ROLLBACK)
    const { rows } = await own.query<{ n: string }>(
      `select count(*)::text as n from information_schema.columns
        where table_name = 'custom_domains' and column_name like 'mail_transfer_hold%'`,
    )
    expect(rows[0].n).toBe('0')
    const objs = await own.query<{ n: string }>(
      `select count(*)::text as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.proname in ('handover_registrar_domain','release_domain_mail_transfer_hold','request_domain_mail_hold_release','log_domain_handover_event','_ensure_user_primary','custom_domains_mail_hold_guard','dhe_block_mutation')`,
    )
    expect(objs.rows[0].n).toBe('0')
    await own.close()
  })
})
