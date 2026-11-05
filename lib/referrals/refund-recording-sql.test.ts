import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { BILLING_TRANSACTION_KIND_SQL } from './referral-sql-test-kinds'

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const COMMISSION_SQL = readFileSync(path.join(ROOT, 'scripts/102-referral-commission-ledger.sql'), 'utf8')
const REFUND_SQL = readFileSync(path.join(ROOT, 'scripts/114-domain-expiry-refund-recording.sql'), 'utf8')
const BASE_SCHEMA = `
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create table public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid,
  kind text not null check (kind in (${BILLING_TRANSACTION_KIND_SQL})),
  status text not null,
  amount_cents bigint not null,
  currency text not null default 'TRY',
  provider text not null default 'iyzico',
  provider_ref text,
  idempotency_key text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create table public.domain_renewals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  domain text not null,
  period_years integer not null default 1,
  baseline_expires_raw text,
  provider_expires_raw text,
  status text not null,
  error_message text,
  updated_at timestamptz not null default now()
);
create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  domain text not null,
  provider text not null default 'domainnameapi',
  expires_at timestamptz
);
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  channel text not null,
  type text not null,
  subject text not null,
  body text not null,
  status text not null,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
`

async function withDatabase<T>(run: (db: PGlite) => Promise<T>): Promise<T> {
  const db = new PGlite()
  try {
    await db.exec(BASE_SCHEMA)
    await db.exec(CORE_SQL)
    await db.exec(COMMISSION_SQL)
    await db.exec(REFUND_SQL)
    return await run(db)
  } finally {
    await db.close()
  }
}

async function insertUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return rows[0].id
}

async function insertPartner(db: PGlite, email: string, code: string): Promise<string> {
  const userId = await insertUser(db, email)
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_partners (user_id, referral_code, status)
     values ($1, $2, 'active') returning id`,
    [userId, code],
  )
  return rows[0].id
}

async function insertAttribution(db: PGlite, partnerId: string, email: string): Promise<string> {
  const referredUserId = await insertUser(db, email)
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_attributions
       (referred_user_id, partner_id, code_snapshot, source, captured_at)
     values ($1, $2, 'REFUND01', 'email', now()) returning id`,
    [referredUserId, partnerId],
  )
  return referredUserId
}

async function insertCharge(db: PGlite, userId: string, subscriptionId: string, idempotencyKey: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.billing_transactions
       (user_id, subscription_id, kind, status, amount_cents, currency, provider, idempotency_key)
     values ($1, $2, 'charge', 'succeeded', 12105, 'TRY', 'iyzico', $3)
     returning id`,
    [userId, subscriptionId, idempotencyKey],
  )
  return rows[0].id
}

async function recordRefund(db: PGlite, chargeId: string, providerRef: string, idempotencyKey: string) {
  const { rows } = await db.query<{ result: { ok: boolean; duplicate?: boolean; error?: string; refundTransactionId?: string } }>(
    'select public.record_iyzico_billing_refund($1::uuid, $2, $3) as result',
    [chargeId, providerRef, idempotencyKey],
  )
  return rows[0].result
}

describe('scripts/114-domain-expiry-refund-recording.sql', () => {
  it('adds a retry marker for renewal expiry sync', async () => {
    await withDatabase(async (db) => {
      const userId = await insertUser(db, 'domain-owner@gloval.test')
      const { rows } = await db.query<{ expiry_sync_pending: boolean }>(
        `insert into public.domain_renewals (user_id, domain, status)
         values ($1, 'example.test', 'completed') returning expiry_sync_pending`,
        [userId],
      )
      expect(rows).toEqual([{ expiry_sync_pending: false }])
    })
  })

  it('records one full iyzico refund and deduplicates the same provider reference', async () => {
    await withDatabase(async (db) => {
      const partnerId = await insertPartner(db, 'partner-refund@gloval.test', 'REFUND01')
      const referredUserId = await insertAttribution(db, partnerId, 'buyer-refund@gloval.test')
      const subscriptionId = crypto.randomUUID()
      const chargeId = await insertCharge(db, referredUserId, subscriptionId, 'charge-1')

      const first = await recordRefund(db, chargeId, 'iyzico-host-ref-1', `iyzico-refund:${chargeId}`)
      const duplicate = await recordRefund(db, chargeId, 'iyzico-host-ref-1', 'retry-with-same-reference')
      const { rows: charge } = await db.query<{
        refund_status: string
        refunded_amount_cents: string
        refunded_at: string | null
      }>(
        `select refund_status, refunded_amount_cents::text, refunded_at::text
         from public.billing_transactions where id = $1`,
        [chargeId],
      )
      const { rows: refund } = await db.query<{
        refund_of_transaction_id: string
        amount_cents: string
        status: string
      }>(
        `select refund_of_transaction_id, amount_cents::text, status
         from public.billing_transactions where kind = 'refund'`,
      )
      const { rows: reversal } = await db.query<{
        status: string
        reversal_reason: string
        reversal_kind: string
      }>(
        'select status, reversal_reason, reversal_kind from public.referral_commissions',
      )
      const { rows: ledger } = await db.query<{ entry_type: string; amount_cents: string }>(
        `select entry_type, amount_cents::text
         from public.referral_commission_ledger order by created_at`,
      )

      expect(first).toMatchObject({ ok: true, duplicate: false })
      expect(duplicate).toMatchObject({ ok: true, duplicate: true })
      expect(charge[0]).toMatchObject({ refund_status: 'refunded', refunded_amount_cents: '12105' })
      expect(charge[0].refunded_at).toBeTruthy()
      expect(refund).toEqual([{
        refund_of_transaction_id: chargeId,
        amount_cents: '-12105',
        status: 'succeeded',
      }])
      expect(reversal).toEqual([{
        status: 'reversed',
        reversal_reason: 'refund',
        reversal_kind: 'pre_hold',
      }])
      expect(ledger.map((entry) => entry.entry_type)).toEqual(['commission', 'refund_pre_hold'])
      expect(ledger.reduce((sum, entry) => sum + Number(entry.amount_cents), 0)).toBe(0)

      const differentReference = await recordRefund(db, chargeId, 'iyzico-host-ref-2', `second:${chargeId}`)
      expect(differentReference).toMatchObject({ ok: false, error: 'refund_already_recorded' })
    })
  })

  it('reverses only the commission tied to the refunded payment, preserving maturity buckets', async () => {
    await withDatabase(async (db) => {
      const partnerOne = await insertPartner(db, 'partner-one@gloval.test', 'REFUND02')
      const partnerTwo = await insertPartner(db, 'partner-two@gloval.test', 'REFUND03')
      const buyerOne = await insertAttribution(db, partnerOne, 'buyer-one@gloval.test')
      const buyerTwo = await insertAttribution(db, partnerTwo, 'buyer-two@gloval.test')
      const sharedSubscriptionId = crypto.randomUUID()
      const chargeOne = await insertCharge(db, buyerOne, sharedSubscriptionId, 'charge-one')
      const chargeTwo = await insertCharge(db, buyerTwo, sharedSubscriptionId, 'charge-two')

      await db.exec('alter table public.referral_commission_ledger disable trigger referral_commission_ledger_immutable_trigger')
      await db.query(`
        update public.referral_commissions
        set available_at = clock_timestamp() - interval '1 second'
        where billing_transaction_id = $1
      `, [chargeOne])
      await db.query(`
        update public.referral_commission_ledger
        set available_at = clock_timestamp() - interval '1 second'
        where billing_transaction_id = $1 and entry_type = 'commission'
      `, [chargeOne])
      await db.exec('alter table public.referral_commission_ledger enable trigger referral_commission_ledger_immutable_trigger')

      const result = await recordRefund(db, chargeOne, 'iyzico-host-ref-matured', `iyzico-refund:${chargeOne}`)
      const { rows: commissions } = await db.query<{ billing_transaction_id: string; status: string; reversal_kind: string | null }>(
        `select billing_transaction_id, status, reversal_kind
         from public.referral_commissions order by billing_transaction_id`,
      )
      const { rows: reversalEntry } = await db.query<{ entry_type: string; amount_cents: string }>(
        `select entry_type, amount_cents::text
         from public.referral_commission_ledger where entry_type like 'refund_%'`,
      )

      expect(result).toMatchObject({ ok: true, duplicate: false })
      expect(commissions).toHaveLength(2)
      expect(commissions).toEqual(expect.arrayContaining([
        { billing_transaction_id: chargeOne, status: 'reversed', reversal_kind: 'post_hold' },
        { billing_transaction_id: chargeTwo, status: 'pending', reversal_kind: null },
      ]))
      expect(reversalEntry).toEqual([{ entry_type: 'refund_adjustment', amount_cents: '-2017' }])
    })
  })
})
