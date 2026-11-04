import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const DASHBOARD_SQL = readFileSync(path.join(ROOT, 'scripts/097-referral-partner-dashboard.sql'), 'utf8')
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

let db: PGlite
let userCounter = 0
let partnerCounter = 0

beforeAll(async () => {
  db = new PGlite()
  await db.exec(BASE_SCHEMA)
  await db.exec(CORE_SQL)
  await db.exec(DASHBOARD_SQL)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  userCounter = 0
  partnerCounter = 0
  await db.exec(`
    delete from public.billing_transactions;
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
    `insert into public.referral_partners (user_id, referral_code, status, iban_last4)
     values ($1, $2, 'active', '4321') returning id`,
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
