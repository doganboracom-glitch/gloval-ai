import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Executes scripts/134-project-handover.sql (and its rollback) against an in-process
 * Postgres (PGlite) with a minimal stand-in for the production tables. Nothing here
 * talks to a real database.
 */

const ROOT = process.cwd()
const MIGRATION = readFileSync(path.join(ROOT, 'scripts/134-project-handover.sql'), 'utf8')
const ROLLBACK = readFileSync(path.join(ROOT, 'scripts/134-project-handover.rollback.sql'), 'utf8')

const BASE_SCHEMA = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, email_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now());
create table public.profiles (id uuid primary key);
create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid, name text not null default 'Site',
  status text not null default 'draft', project_type text not null default 'corporate',
  slug text, published boolean not null default false, client_token text);
create table public.custom_domains (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, domain text not null unique,
  website_project_id uuid, status text not null default 'active');
create table public.ecommerce_products (id uuid primary key default gen_random_uuid(), project_id uuid, owner_id uuid);
create table public.ecommerce_orders (id uuid primary key default gen_random_uuid(), project_id uuid, owner_id uuid);
create table public.ecommerce_categories (id uuid primary key default gen_random_uuid(), project_id uuid, owner_id uuid);
create table public.ecommerce_product_variants (id uuid primary key default gen_random_uuid(), project_id uuid, owner_id uuid);
create table public.ecommerce_payment_settings (project_id uuid primary key, owner_id uuid);
create table public.project_entitlements (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, user_id uuid not null,
  code text not null, name text, status text not null default 'active', unique (project_id, code));
create table public.billing_plans (id uuid primary key default gen_random_uuid(), code text not null, product_category text);
create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id uuid, status text not null default 'active',
  current_period_end timestamptz, suspended_project_ids uuid[] not null default '{}');
create table public.user_addon_entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, addon_code text not null,
  status text not null default 'active', starts_at timestamptz, expires_at timestamptz, subscription_id uuid);
create table public.user_limit_overrides (user_id uuid primary key, site_limit int, expires_at timestamptz);
-- user-history tables that must NEVER move
create table public.ads_brands (id uuid primary key default gen_random_uuid(), user_id uuid, project_id uuid);
create table public.support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid, project_id uuid);
create table public.draft_site_reminders (id uuid primary key default gen_random_uuid(), user_id uuid, project_id uuid);
`

type Result = Record<string, unknown> & { ok: boolean; state?: string }

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

async function newUser(opts: { profile?: boolean; banned?: string | null; deleted?: boolean; confirmed?: boolean } = {}) {
  counter += 1
  const email = `user${counter}@example.com`
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, banned_until, deleted_at) values ($1,$2,$3,$4) returning id`,
    [
      email,
      opts.confirmed === false ? null : new Date().toISOString(),
      opts.banned ?? null,
      opts.deleted ? new Date().toISOString() : null,
    ],
  )
  if (opts.profile !== false) await db.query(`insert into public.profiles (id) values ($1)`, [rows[0].id])
  return { id: rows[0].id, email }
}

async function newProject(
  owner: string,
  opts: { type?: string; published?: boolean; name?: string; token?: string | null } = {},
) {
  counter += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into public.projects (owner_id, name, project_type, published, slug, client_token)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [owner, opts.name ?? 'Demo Site', opts.type ?? 'corporate', opts.published ?? false, `slug-${counter}`, opts.token ?? null],
  )
  return rows[0].id
}

async function givePlan(userId: string, code: string) {
  const plan = await db.query<{ id: string }>(
    `insert into public.billing_plans (code, product_category) values ($1,'plan') returning id`,
    [code],
  )
  const sub = await db.query<{ id: string }>(
    `insert into public.billing_subscriptions (user_id, plan_id, status, current_period_end)
     values ($1,$2,'active', now() + interval '20 days') returning id`,
    [userId, plan.rows[0].id],
  )
  return sub.rows[0].id
}

async function handover(
  projectId: string,
  from: string,
  to: string,
  opts: { key?: string; force?: boolean; reason?: string } = {},
): Promise<Result> {
  counter += 1
  const { rows } = await db.query<{ r: Result }>(
    `select public.admin_handover_project($1,$2,$3,'admin@example.com',$4,$5,$6) as r`,
    [projectId, from, to, opts.reason ?? 'Müşteri siteyi onayladı', opts.key ?? `key-${counter}`, opts.force ?? false],
  )
  return rows[0].r
}

/** PGlite prepared statements take one command; split a script and run each with the same params. */
async function runAll(script: string, params: unknown[]) {
  for (const stmt of script.split(';').map((x) => x.trim()).filter(Boolean)) await db.query(stmt, params)
}

async function ownerOf(projectId: string) {
  const { rows } = await db.query<{ owner_id: string }>(`select owner_id from public.projects where id = $1`, [projectId])
  return rows[0].owner_id
}

describe('admin_handover_project', () => {
  it('moves the site, its store rows and entitlements, and writes one audit row', async () => {
    const from = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id, { type: 'ecommerce', published: true, name: 'Çiçekçi Şükrü' })
    await givePlan(to.id, 'ecommerce')
    await runAll(`insert into public.ecommerce_products (project_id, owner_id) values ($1,$2),($1,$2);
       insert into public.ecommerce_orders (project_id, owner_id) values ($1,$2);
       insert into public.ecommerce_categories (project_id, owner_id) values ($1,$2);
       insert into public.ecommerce_product_variants (project_id, owner_id) values ($1,$2),($1,$2),($1,$2);
       insert into public.ecommerce_payment_settings (project_id, owner_id) values ($1,$2);
       insert into public.project_entitlements (project_id, user_id, code) values ($1,$2,'aura_cursor');`,
      [pid, from.id],
    )
    const r = await handover(pid, from.id, to.id)
    expect(r).toMatchObject({ ok: true, state: 'ok', replayed: false })
    expect(r.moved).toEqual({
      ecommerce_products: 2,
      ecommerce_orders: 1,
      ecommerce_categories: 1,
      ecommerce_product_variants: 3,
      ecommerce_payment_settings: 1,
      project_entitlements: 1,
    })
    expect(r.entitlement_codes).toEqual(['aura_cursor'])
    expect(await ownerOf(pid)).toBe(to.id)
    for (const t of ['ecommerce_products', 'ecommerce_orders', 'ecommerce_categories', 'ecommerce_product_variants']) {
      const { rows } = await db.query<{ n: string }>(`select count(*)::text n from public.${t} where owner_id = $1`, [to.id])
      expect(Number(rows[0].n)).toBeGreaterThan(0)
    }
    const ent = await db.query<{ user_id: string }>(`select user_id from public.project_entitlements where project_id = $1`, [pid])
    expect(ent.rows[0].user_id).toBe(to.id)
    const audit = await db.query<{ project_name: string; actor_email: string; snapshot: Record<string, unknown> }>(
      `select project_name, actor_email, snapshot from public.project_handover_events where project_id = $1`,
      [pid],
    )
    expect(audit.rows).toHaveLength(1)
    expect(audit.rows[0].project_name).toBe('Çiçekçi Şükrü')
    expect(audit.rows[0].snapshot).toMatchObject({ from_user_id: from.id, to_user_id: to.id, client_token_rotated: false })
  })

  it('is idempotent: the same key a second time moves nothing and returns already_done', async () => {
    const from = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id)
    const first = await handover(pid, from.id, to.id, { key: 'idem-1' })
    expect(first.state).toBe('ok')
    const second = await handover(pid, from.id, to.id, { key: 'idem-1' })
    expect(second).toMatchObject({ ok: true, state: 'already_done', replayed: true })
    const { rows } = await db.query<{ n: string }>(`select count(*)::text n from public.project_handover_events where project_id = $1`, [pid])
    expect(rows[0].n).toBe('1')
  })

  it('rejects a reused key for a different target', async () => {
    const from = await newUser()
    const to = await newUser()
    const other = await newUser()
    const pid = await newProject(from.id)
    await handover(pid, from.id, to.id, { key: 'reuse-1' })
    expect(await handover(pid, to.id, other.id, { key: 'reuse-1' })).toMatchObject({ ok: false, state: 'idempotency_key_reuse' })
  })

  it('owner_changed when the expected owner is no longer the owner', async () => {
    const from = await newUser()
    const stale = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id)
    expect(await handover(pid, stale.id, to.id)).toMatchObject({ ok: false, state: 'owner_changed' })
    expect(await ownerOf(pid)).toBe(from.id)
  })

  it('same_owner when the target already owns the site', async () => {
    const owner = await newUser()
    const pid = await newProject(owner.id)
    expect(await handover(pid, owner.id, owner.id)).toMatchObject({ ok: false, state: 'same_owner' })
  })

  it('not_found for a missing or deleted project', async () => {
    const a = await newUser()
    const b = await newUser()
    expect(await handover('00000000-0000-0000-0000-000000000000', a.id, b.id)).toMatchObject({ state: 'not_found' })
    const pid = await newProject(a.id)
    await db.query(`update public.projects set status = 'deleted' where id = $1`, [pid])
    expect(await handover(pid, a.id, b.id)).toMatchObject({ state: 'not_found' })
  })

  it('target_invalid for a missing profile, a banned or a deleted user', async () => {
    const from = await newUser()
    const pid = await newProject(from.id)
    const noProfile = await newUser({ profile: false })
    const banned = await newUser({ banned: new Date(Date.now() + 86_400_000).toISOString() })
    const deleted = await newUser({ deleted: true })
    for (const t of [noProfile, banned, deleted]) {
      expect(await handover(pid, from.id, t.id)).toMatchObject({ ok: false, state: 'target_invalid' })
    }
    expect(await handover(pid, from.id, '00000000-0000-0000-0000-000000000000')).toMatchObject({ state: 'target_invalid' })
    expect(await ownerOf(pid)).toBe(from.id)
  })

  it('domain_attached when a custom domain of another user is linked to the site', async () => {
    const from = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id)
    await db.query(`insert into public.custom_domains (user_id, domain, website_project_id) values ($1,'blocked.example',$2)`, [from.id, pid])
    const r = await handover(pid, from.id, to.id)
    expect(r).toMatchObject({ ok: false, state: 'domain_attached' })
    expect(String(r.message)).toContain('alan adı')
    // The domain owned by the TARGET does not block.
    await db.query(`update public.custom_domains set user_id = $1 where domain = 'blocked.example'`, [to.id])
    expect((await handover(pid, from.id, to.id)).state).toBe('ok')
  })

  describe('quota', () => {
    it('quota_exceeded without force when the target is full, ok with force (and recorded)', async () => {
      const from = await newUser()
      const to = await newUser()
      await newProject(to.id, { published: true }) // free plan allows 1 published site
      const pid = await newProject(from.id, { published: true })
      const denied = await handover(pid, from.id, to.id)
      expect(denied).toMatchObject({ ok: false, state: 'quota_exceeded' })
      expect(await ownerOf(pid)).toBe(from.id)
      const forced = await handover(pid, from.id, to.id, { force: true })
      expect(forced).toMatchObject({ ok: true, state: 'ok', quota_exceeded: true, force_quota: true })
      const audit = await db.query<{ snapshot: Record<string, unknown> }>(`select snapshot from public.project_handover_events where project_id = $1`, [pid])
      expect(audit.rows[0].snapshot).toMatchObject({ quota_exceeded: true, force_quota: true })
    })

    it('an unpublished site never trips the quota', async () => {
      const from = await newUser()
      const to = await newUser()
      await newProject(to.id, { published: true })
      const pid = await newProject(from.id, { published: false })
      expect((await handover(pid, from.id, to.id)).state).toBe('ok')
    })

    it('a published ecommerce site needs an ecommerce allowance', async () => {
      const from = await newUser()
      const pro = await newUser()
      await givePlan(pro.id, 'pro')
      const pid = await newProject(from.id, { type: 'ecommerce', published: true })
      expect((await handover(pid, from.id, pro.id)).state).toBe('quota_exceeded')
      const ecom = await newUser()
      await givePlan(ecom.id, 'ecommerce')
      expect((await handover(pid, from.id, ecom.id)).state).toBe('ok')
    })

    it('counts an active site add-on and a user override in the allowance', async () => {
      const from = await newUser()
      const to = await newUser()
      const subId = await givePlan(to.id, 'pro')
      await db.query(`insert into public.user_addon_entitlements (user_id, addon_code, subscription_id) values ($1,'extra_corporate_site_1',$2)`, [to.id, subId])
      for (let i = 0; i < 3; i++) await newProject(to.id, { published: true })
      const pid = await newProject(from.id, { published: true })
      expect((await handover(pid, from.id, to.id)).state).toBe('ok') // pro 3 + 1 add-on = 4
      const p2 = await newProject(from.id, { published: true })
      expect((await handover(p2, from.id, to.id)).state).toBe('quota_exceeded')
      await db.query(`insert into public.user_limit_overrides (user_id, site_limit) values ($1, 10)`, [to.id])
      expect((await handover(p2, from.id, to.id)).state).toBe('ok')
    })
  })

  it('removes the project from the old owner suspended_project_ids', async () => {
    const from = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id)
    const keep = await newProject(from.id)
    const subId = await givePlan(from.id, 'pro')
    await db.query(`update public.billing_subscriptions set suspended_project_ids = array[$1::uuid, $2::uuid] where id = $3`, [pid, keep, subId])
    await handover(pid, from.id, to.id)
    const { rows } = await db.query<{ ids: string[] }>(`select suspended_project_ids ids from public.billing_subscriptions where id = $1`, [subId])
    expect(rows[0].ids).toEqual([keep])
  })

  it('does NOT move user-history tables or draft reminders', async () => {
    const from = await newUser()
    const to = await newUser()
    const pid = await newProject(from.id)
    await runAll(`insert into public.ads_brands (user_id, project_id) values ($1,$2);
       insert into public.support_tickets (user_id, project_id) values ($1,$2);
       insert into public.draft_site_reminders (user_id, project_id) values ($1,$2);`,
      [from.id, pid],
    )
    await handover(pid, from.id, to.id)
    for (const t of ['ads_brands', 'support_tickets', 'draft_site_reminders']) {
      const { rows } = await db.query<{ user_id: string }>(`select user_id from public.${t} where project_id = $1`, [pid])
      expect(rows.map((r) => r.user_id)).toEqual([from.id])
    }
  })

  it('keeps client_token, but rotates it when the target owns the same token', async () => {
    const from = await newUser()
    const to = await newUser()
    const p1 = await newProject(from.id, { token: 'token-aaaaaaaa' })
    expect((await handover(p1, from.id, to.id)).client_token_rotated).toBe(false)
    const { rows: kept } = await db.query<{ client_token: string }>(`select client_token from public.projects where id = $1`, [p1])
    expect(kept[0].client_token).toBe('token-aaaaaaaa')

    const other = await newUser()
    await newProject(to.id, { token: 'token-bbbbbbbb' })
    const p2 = await newProject(other.id, { token: 'token-bbbbbbbb' })
    expect((await handover(p2, other.id, to.id)).client_token_rotated).toBe(true)
    const { rows } = await db.query<{ client_token: string }>(`select client_token from public.projects where id = $1`, [p2])
    expect(rows[0].client_token).not.toBe('token-bbbbbbbb')
  })

  it('rejects a short reason or a missing key', async () => {
    const a = await newUser()
    const b = await newUser()
    const pid = await newProject(a.id)
    expect(await handover(pid, a.id, b.id, { reason: 'kısa' })).toMatchObject({ state: 'bad_request' })
    expect(await handover(pid, a.id, b.id, { key: ' ' })).toMatchObject({ state: 'bad_request' })
  })

  it('can hand the site back; the audit shows two rows', async () => {
    const a = await newUser()
    const b = await newUser()
    const pid = await newProject(a.id)
    await handover(pid, a.id, b.id)
    expect((await handover(pid, b.id, a.id)).state).toBe('ok')
    const { rows } = await db.query<{ n: string }>(`select count(*)::text n from public.project_handover_events where project_id = $1`, [pid])
    expect(rows[0].n).toBe('2')
  })
})

describe('audit table', () => {
  it('is append-only', async () => {
    const a = await newUser()
    const b = await newUser()
    const pid = await newProject(a.id)
    await handover(pid, a.id, b.id)
    await expect(db.exec(`update public.project_handover_events set reason = 'x'`)).rejects.toThrow(/append-only/)
    await expect(db.exec(`delete from public.project_handover_events`)).rejects.toThrow(/append-only/)
    await expect(db.exec(`truncate public.project_handover_events`)).rejects.toThrow(/append-only/)
  })

  it('allows only one handover row per handover_id and a unique idempotency key', async () => {
    const a = await newUser()
    const b = await newUser()
    const pid = await newProject(a.id)
    const r = await handover(pid, a.id, b.id, { key: 'uniq-1' })
    await expect(
      db.query(
        `insert into public.project_handover_events (handover_id, event, idempotency_key, project_id, from_user_id, to_user_id, actor_email, reason)
         values ($1,'handover','another',$2,$3,$4,'x','y')`,
        [r.handover_id, pid, a.id, b.id],
      ),
    ).rejects.toThrow(/duplicate key/)
    await expect(
      db.query(
        `insert into public.project_handover_events (handover_id, event, idempotency_key, project_id, from_user_id, to_user_id, actor_email, reason)
         values (gen_random_uuid(),'handover','uniq-1',$1,$2,$3,'x','y')`,
        [pid, a.id, b.id],
      ),
    ).rejects.toThrow(/duplicate key/)
  })
})

describe('admin_project_handover_preview', () => {
  it('returns the whole picture in one JSON, matching the email case-insensitively', async () => {
    const from = await newUser()
    const to = await newUser()
    await givePlan(to.id, 'pro')
    const pid = await newProject(from.id, { type: 'ecommerce', published: true })
    await runAll(`insert into public.ecommerce_products (project_id, owner_id) values ($1,$2);
       insert into public.ecommerce_orders (project_id, owner_id) values ($1,$2),($1,$2);
       insert into public.project_entitlements (project_id, user_id, code, name) values ($1,$2,'aura_cursor','Aura İmleç');`,
      [pid, from.id],
    )
    const { rows } = await db.query<{ r: Record<string, any> }>(
      `select public.admin_project_handover_preview($1, $2) as r`,
      [pid, ` ${to.email.toUpperCase()} `],
    )
    const r = rows[0].r
    expect(r.found).toBe(true)
    expect(r.project).toMatchObject({ type: 'ecommerce', published: true })
    expect(r.from.email).toBe(from.email)
    expect(r.target).toMatchObject({ found: true, email: to.email, confirmed: true, active: true, plan_code: 'pro', site_limit: 3 })
    expect(r.counts).toEqual({ products: 1, orders: 2 })
    expect(r.entitlements[0]).toMatchObject({ code: 'aura_cursor' })
    expect(r.blockers).toEqual([])
    expect(r.warnings).toEqual(expect.arrayContaining(['published', 'quota_exceeded', 'ecommerce_plan_missing']))
  })

  it('lists blockers for an unknown e-mail, same owner and a foreign domain', async () => {
    const from = await newUser()
    const pid = await newProject(from.id)
    const unknown = await db.query<{ r: Record<string, any> }>(`select public.admin_project_handover_preview($1,'nobody@example.com') as r`, [pid])
    expect(unknown.rows[0].r.blockers).toContain('target_invalid')
    expect(unknown.rows[0].r.target.found).toBe(false)

    const same = await db.query<{ r: Record<string, any> }>(`select public.admin_project_handover_preview($1,$2) as r`, [pid, from.email])
    expect(same.rows[0].r.blockers).toContain('same_owner')

    const to = await newUser()
    await db.query(`insert into public.custom_domains (user_id, domain, website_project_id) values ($1,'pv.example',$2)`, [from.id, pid])
    const dom = await db.query<{ r: Record<string, any> }>(`select public.admin_project_handover_preview($1,$2) as r`, [pid, to.email])
    expect(dom.rows[0].r.blockers).toContain('domain_attached')
    expect(dom.rows[0].r.domains[0].domain).toBe('pv.example')
  })

  it('reports found=false for a missing project and warns about an unconfirmed target', async () => {
    const missing = await db.query<{ r: Record<string, any> }>(`select public.admin_project_handover_preview(gen_random_uuid(),'a@b.c') as r`)
    expect(missing.rows[0].r).toMatchObject({ found: false, blockers: ['not_found'] })
    const from = await newUser()
    const to = await newUser({ confirmed: false })
    const pid = await newProject(from.id)
    const r = await db.query<{ r: Record<string, any> }>(`select public.admin_project_handover_preview($1,$2) as r`, [pid, to.email])
    expect(r.rows[0].r.warnings).toContain('target_unconfirmed')
    expect(r.rows[0].r.target.confirmed).toBe(false)
  })
})

describe('privileges', () => {
  it('anon and authenticated cannot call the functions or read the audit table', async () => {
    const a = await newUser()
    const b = await newUser()
    const pid = await newProject(a.id)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      try {
        await expect(
          db.query(`select public.admin_handover_project($1,$2,$3,'x@y.z','long enough reason','priv-${role}',false)`, [pid, a.id, b.id]),
        ).rejects.toThrow(/permission denied/)
        await expect(db.query(`select public.admin_project_handover_preview($1,'a@b.c')`, [pid])).rejects.toThrow(/permission denied/)
        await expect(db.query(`select * from public.project_handover_events`)).rejects.toThrow(/permission denied/)
      } finally {
        await db.exec('reset role')
      }
    }
    expect(await ownerOf(pid)).toBe(a.id)
  })

  it('service_role can call the public functions but not the internal helper', async () => {
    const a = await newUser()
    const pid = await newProject(a.id)
    await db.exec('set role service_role')
    try {
      await expect(db.query(`select public.admin_project_handover_preview($1,'a@b.c')`, [pid])).resolves.toBeTruthy()
      await expect(db.query(`select public._ph_target_limits($1)`, [a.id])).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('functions are security definer with a pinned search_path', async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; cfg: string[] | null }>(
      `select p.proname, p.prosecdef, p.proconfig as cfg from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.proname in ('admin_handover_project','admin_project_handover_preview','_ph_target_limits')`,
    )
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(r.prosecdef).toBe(true)
      expect(r.cfg?.join(',')).toContain('search_path')
    }
  })
})

describe('migration', () => {
  it('is idempotent and works without projects.client_token', async () => {
    const own = new PGlite()
    await own.exec(BASE_SCHEMA.replace(', client_token text', ''))
    await own.exec(MIGRATION)
    await own.exec(MIGRATION)
    const { rows: u } = await own.query<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at) values ('a@x.com', now()),('b@x.com', now()) returning id`,
    )
    await own.query(`insert into public.profiles (id) values ($1),($2)`, [u[0].id, u[1].id])
    const { rows: p } = await own.query<{ id: string }>(`insert into public.projects (owner_id) values ($1) returning id`, [u[0].id])
    const { rows } = await own.query<{ r: Result }>(
      `select public.admin_handover_project($1,$2,$3,'a@x.com','long enough reason','nt-1',false) as r`,
      [p[0].id, u[0].id, u[1].id],
    )
    expect(rows[0].r).toMatchObject({ ok: true, state: 'ok', client_token_rotated: false })
    await own.close()
  })

  it('rollback removes the functions and the table', async () => {
    const own = new PGlite()
    await own.exec(BASE_SCHEMA)
    await own.exec(MIGRATION)
    await own.exec(ROLLBACK)
    const { rows } = await own.query<{ n: string }>(
      `select (select count(*) from pg_proc where proname in ('admin_handover_project','admin_project_handover_preview','_ph_target_limits','phe_block_mutation'))::text
              || '/' || (select count(*) from information_schema.tables where table_name = 'project_handover_events')::text as n`,
    )
    expect(rows[0].n).toBe('0/0')
    await own.close()
  })
})
