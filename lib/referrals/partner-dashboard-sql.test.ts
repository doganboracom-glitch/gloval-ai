import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const DASHBOARD_SQL = readFileSync(path.join(ROOT, 'scripts/097-referral-partner-dashboard.sql'), 'utf8')
const ADMIN_SQL = readFileSync(path.join(ROOT, 'scripts/098-referral-partner-admin-controls.sql'), 'utf8')
const BASE_SCHEMA = `
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create table public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  subscription_id uuid,
  kind text not null,
  amount_cents integer not null,
  status text not null
);
`

type DashboardSummary = {
  referralCode: string
  status: string
  email: string | null
  clicks: number
  signups: number
  verifiedSignups: number
  paidCustomers: number | null
  customers: Array<{ email: string | null; status: string; createdAt: string }>
}

type AdminPartnerSummary = {
  partnerId: string
  referralCode: string
  status: string
  email: string | null
  clicks: number
  signups: number
  verifiedSignups: number
  paidCustomers: number
  ibanLast4: string | null
  lastStatusChangedAt: string
}

let db: PGlite
let userCounter = 0
let partnerCounter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(CORE_SQL)
  await db.exec(DASHBOARD_SQL)
  await db.exec(ADMIN_SQL)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  userCounter = 0
  partnerCounter = 0
  await db.exec(`
    delete from public.billing_transactions;
    delete from public.referral_partner_events;
    delete from public.referral_attributions;
    delete from public.referral_daily_clicks;
    delete from public.referral_click_dedup;
    delete from public.referral_signup_intents;
    delete from public.referral_partners;
    delete from auth.users;
  `)
})

async function newUser(email: string): Promise<string> {
  userCounter += 1
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return rows[0].id
}

async function newPartner(userId: string): Promise<{ id: string; code: string }> {
  partnerCounter += 1
  const code = `PARTNER${String(partnerCounter).padStart(4, '0')}`
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_partners
       (user_id, referral_code, status, payee_name, tax_status, iban_ciphertext, iban_key_version, iban_last4)
     values ($1, $2, 'active', 'Test Recipient', 'individual', 'encrypted-test-value', 'v1', '4321') returning id`,
    [userId, code],
  )
  return { id: rows[0].id, code }
}

async function addAttribution(input: {
  partnerId: string
  userId: string
  code: string
  verifiedAt: string | null
  createdAt: string
}) {
  await db.query(
    `insert into public.referral_attributions
       (referred_user_id, partner_id, code_snapshot, source, captured_at, verified_at, created_at)
     values ($1, $2, $3, 'email', now(), $4, $5)`,
    [input.userId, input.partnerId, input.code, input.verifiedAt, input.createdAt],
  )
}

describe('scripts/097-referral-partner-dashboard.sql', () => {
  it('aggregates clicks, referrals, verification, paid customers, and the latest customer rows', async () => {
    const ownerId = await newUser('owner@example.test')
    const { id: partnerId, code } = await newPartner(ownerId)
    const paidUser = await newUser('paid@example.test')
    const newUserId = await newUser('new@example.test')

    await addAttribution({
      partnerId,
      userId: paidUser,
      code,
      verifiedAt: '2026-11-02T12:00:00.000Z',
      createdAt: '2026-11-02T10:00:00.000Z',
    })
    await addAttribution({
      partnerId,
      userId: newUserId,
      code,
      verifiedAt: null,
      createdAt: '2026-11-03T10:00:00.000Z',
    })

    await db.query(
      'insert into public.referral_daily_clicks (partner_id, click_date, unique_clicks) values ($1, $2, $3), ($1, $4, $5)',
      [partnerId, '2026-11-02', 4, '2026-11-03', 3],
    )
    await db.query(
      `insert into public.billing_transactions (user_id, subscription_id, kind, amount_cents, status)
       values ($1, gen_random_uuid(), 'charge', 2500, 'succeeded'),
              ($2, gen_random_uuid(), 'charge', 2500, 'failed'),
              ($2, gen_random_uuid(), 'charge', 0, 'succeeded'),
              ($2, gen_random_uuid(), 'refund', 2500, 'succeeded')`,
      [paidUser, newUserId],
    )

    const { rows } = await db.query<{ summary: DashboardSummary[] }>(
      'select public.referral_partner_dashboard($1::uuid, true) as summary',
      [ownerId],
    )
    const [summary] = rows[0].summary

    expect(summary).toMatchObject({
      referralCode: code,
      status: 'active',
      clicks: 7,
      signups: 2,
      verifiedSignups: 1,
      paidCustomers: 1,
    })
    expect(summary.email).toBeNull()
    expect(summary.customers).toHaveLength(2)
    expect(summary.customers[0]).toMatchObject({ email: 'new@example.test', status: 'signup' })
    expect(summary.customers[1]).toMatchObject({ email: 'paid@example.test', status: 'paid' })
  })

  it('provides only read-only aggregate fields to an admin request and restricts function privileges', async () => {
    const ownerId = await newUser('owner@example.test')
    const { id: partnerId, code } = await newPartner(ownerId)
    await db.query(
      'insert into public.referral_daily_clicks (partner_id, click_date, unique_clicks) values ($1, $2, 5)',
      [partnerId, '2026-11-04'],
    )

    const { rows } = await db.query<{ summary: DashboardSummary[] }>(
      'select public.referral_partner_dashboard(null::uuid, false) as summary',
    )
    const [summary] = rows[0].summary
    expect(summary).toMatchObject({
      referralCode: code,
      email: 'owner@example.test',
      clicks: 5,
      signups: 0,
      verifiedSignups: 0,
      paidCustomers: null,
      customers: [],
    })

    const { rows: privileges } = await db.query<{ anon_execute: boolean; service_execute: boolean }>(`
      select
        has_function_privilege('anon', 'public.referral_partner_dashboard(uuid,boolean)', 'execute') as anon_execute,
        has_function_privilege('service_role', 'public.referral_partner_dashboard(uuid,boolean)', 'execute') as service_execute
    `)
    expect(privileges[0]).toEqual({ anon_execute: false, service_execute: true })
  })

  it('refuses customer-email output for unscoped requests', async () => {
    await expect(
      db.query('select public.referral_partner_dashboard(null::uuid, true) as summary'),
    ).rejects.toThrow('customer rows require a partner user id')
  })
})

describe('scripts/098-referral-partner-admin-controls.sql', () => {
  it('aggregates every status and exposes only admin-safe fields', async () => {
    const ownerId = await newUser('owner@example.test')
    const { id: partnerId, code } = await newPartner(ownerId)
    await db.query(
      'insert into public.referral_daily_clicks (partner_id, click_date, unique_clicks) values ($1, $2, 6)',
      [partnerId, '2026-11-04'],
    )

    const { rows } = await db.query<{ summary: AdminPartnerSummary[] }>(
      'select public.referral_partner_admin_summary() as summary',
    )
    expect(rows[0].summary).toHaveLength(1)
    expect(rows[0].summary[0]).toMatchObject({
      partnerId,
      referralCode: code,
      status: 'active',
      email: 'owner@example.test',
      clicks: 6,
      signups: 0,
      verifiedSignups: 0,
      paidCustomers: 0,
      ibanLast4: '4321',
    })
  })

  it('atomically suspends, closes, clears payout details, reactivates, and audits each transition', async () => {
    const ownerId = await newUser('owner@example.test')
    const adminId = await newUser('admin@example.test')
    const { id: partnerId } = await newPartner(ownerId)

    const suspended = await db.query<{ result: { ok: boolean; fromStatus: string; toStatus: string } }>(
      'select public.transition_referral_partner_status($1, $2, $3) as result',
      [partnerId, adminId, 'suspend'],
    )
    expect(suspended.rows[0].result).toMatchObject({ ok: true, fromStatus: 'active', toStatus: 'suspended' })

    const { rows: stoppedClick } = await db.query<{ recorded: boolean }>(
      'select public.record_referral_click($1, $2) as recorded',
      [partnerId, 'a'.repeat(64)],
    )
    expect(stoppedClick[0].recorded).toBe(false)

    const closed = await db.query<{ result: { ok: boolean; fromStatus: string; toStatus: string } }>(
      'select public.transition_referral_partner_status($1, $2, $3) as result',
      [partnerId, adminId, 'close'],
    )
    expect(closed.rows[0].result).toMatchObject({ ok: true, fromStatus: 'suspended', toStatus: 'closed' })

    const { rows: closedPartner } = await db.query<{
      status: string
      payee_name: string | null
      tax_status: string | null
      iban_ciphertext: string | null
      iban_key_version: string | null
      iban_last4: string | null
    }>(
      `select status, payee_name, tax_status, iban_ciphertext, iban_key_version, iban_last4
       from public.referral_partners where id = $1`,
      [partnerId],
    )
    expect(closedPartner[0]).toEqual({
      status: 'closed',
      payee_name: null,
      tax_status: null,
      iban_ciphertext: null,
      iban_key_version: null,
      iban_last4: null,
    })

    const reactivated = await db.query<{ result: { ok: boolean; fromStatus: string; toStatus: string } }>(
      'select public.transition_referral_partner_status($1, $2, $3) as result',
      [partnerId, adminId, 'reactivate'],
    )
    expect(reactivated.rows[0].result).toMatchObject({ ok: true, fromStatus: 'closed', toStatus: 'active' })

    const { rows: restoredClick } = await db.query<{ recorded: boolean }>(
      'select public.record_referral_click($1, $2) as recorded',
      [partnerId, 'b'.repeat(64)],
    )
    expect(restoredClick[0].recorded).toBe(true)

    const { rows: events } = await db.query<{
      action: string
      actor_user_id: string
      from_status: string
      to_status: string
    }>(
      `select action, actor_user_id, from_status, to_status
       from public.referral_partner_events where partner_id = $1 order by created_at`,
      [partnerId],
    )
    expect(events).toEqual([
      { action: 'suspend', actor_user_id: adminId, from_status: 'active', to_status: 'suspended' },
      { action: 'close', actor_user_id: adminId, from_status: 'suspended', to_status: 'closed' },
      { action: 'reactivate', actor_user_id: adminId, from_status: 'closed', to_status: 'active' },
    ])

    const invalid = await db.query<{ result: { ok: boolean; error: string } }>(
      'select public.transition_referral_partner_status($1, $2, $3) as result',
      [partnerId, adminId, 'reactivate'],
    )
    expect(invalid.rows[0].result).toEqual({ ok: false, error: 'invalid_transition' })
    const { rows: eventCount } = await db.query<{ count: number }>(
      'select count(*)::int as count from public.referral_partner_events where partner_id = $1',
      [partnerId],
    )
    expect(eventCount[0].count).toBe(3)
  })

  it('keeps event rows and transition functions restricted to service_role', async () => {
    const { rows } = await db.query<{
      row_security: boolean
      anon_select: boolean
      authenticated_select: boolean
      service_select: boolean
      anon_execute: boolean
      authenticated_execute: boolean
      service_execute: boolean
    }>(`
      select
        (select relrowsecurity from pg_class where oid = 'public.referral_partner_events'::regclass) as row_security,
        has_table_privilege('anon', 'public.referral_partner_events', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.referral_partner_events', 'select') as authenticated_select,
        has_table_privilege('service_role', 'public.referral_partner_events', 'select') as service_select,
        has_function_privilege('anon', 'public.transition_referral_partner_status(uuid,uuid,text)', 'execute') as anon_execute,
        has_function_privilege('authenticated', 'public.transition_referral_partner_status(uuid,uuid,text)', 'execute') as authenticated_execute,
        has_function_privilege('service_role', 'public.transition_referral_partner_status(uuid,uuid,text)', 'execute') as service_execute
    `)
    expect(rows[0]).toEqual({
      row_security: true,
      anon_select: false,
      authenticated_select: false,
      service_select: true,
      anon_execute: false,
      authenticated_execute: false,
      service_execute: true,
    })
  })
})
