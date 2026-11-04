import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const COMMISSION_SQL = readFileSync(path.join(ROOT, 'scripts/099-referral-commission-ledger.sql'), 'utf8')
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
  kind text not null,
  status text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now()
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

let sequence = 0

async function withDatabase<T>(run: (db: PGlite) => Promise<T>): Promise<T> {
  const db = new PGlite()
  try {
    await db.exec(BASE_SCHEMA)
    await db.exec(CORE_SQL)
    await db.exec(COMMISSION_SQL)
    return await run(db)
  } finally {
    await db.close()
  }
}

async function newUser(db: PGlite): Promise<string> {
  sequence += 1
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [`commission-${sequence}@gloval.test`],
  )
  return rows[0].id
}

async function newPartner(db: PGlite, userId: string, status = 'active'): Promise<string> {
  sequence += 1
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_partners (user_id, referral_code, status)
     values ($1, $2, $3) returning id`,
    [userId, `PARTNER${String(sequence).padStart(2, '0')}`, status],
  )
  return rows[0].id
}

async function newAttribution(db: PGlite, partnerId: string, userId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.referral_attributions
       (referred_user_id, partner_id, code_snapshot, source, captured_at)
     values ($1, $2, 'PARTNER01', 'email', now()) returning id`,
    [userId, partnerId],
  )
  return rows[0].id
}

async function newTransaction(
  db: PGlite,
  userId: string | null,
  kind: string,
  status: string,
  subscriptionId: string | null,
  amountCents = 12_105,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.billing_transactions
       (user_id, kind, status, subscription_id, amount_cents)
     values ($1, $2, $3, $4, $5) returning id`,
    [userId, kind, status, subscriptionId, amountCents],
  )
  return rows[0].id
}

async function matureCommission(db: PGlite, transactionId: string) {
  await db.exec('alter table public.referral_commission_ledger disable trigger referral_commission_ledger_immutable_trigger')
  await db.query(`
    update public.referral_commissions
    set available_at = clock_timestamp() - interval '1 second'
    where billing_transaction_id = $1
  `, [transactionId])
  await db.query(`
    update public.referral_commission_ledger
    set available_at = clock_timestamp() - interval '1 second'
    where billing_transaction_id = $1 and entry_type = 'commission'
  `, [transactionId])
  await db.exec('alter table public.referral_commission_ledger enable trigger referral_commission_ledger_immutable_trigger')
}

describe('scripts/099-referral-commission-ledger.sql', () => {
  it('records only the first successful subscription charge and rounds VAT-exclusive commission down', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      const subscriptionId = crypto.randomUUID()
      await newAttribution(db, partnerId, referredUserId)

      await newTransaction(db, referredUserId, 'charge', 'succeeded', subscriptionId)
      await newTransaction(db, referredUserId, 'charge', 'succeeded', subscriptionId, 50_000)
      await newTransaction(db, referredUserId, 'addon', 'succeeded', subscriptionId, 5_000)
      await newTransaction(db, referredUserId, 'domain', 'succeeded', subscriptionId, 2_000)

      const { rows } = await db.query<{
        count: number
        gross_cents: string
        net_cents: string
        commission_cents: string
        status: string
        available_at: string
        paid_at: string
      }>(`
        select count(*) over ()::integer as count, gross_cents::text, net_cents::text,
          commission_cents::text, status, available_at::text, paid_at::text
        from public.referral_commissions
      `)

      expect(rows).toHaveLength(1)
      expect(Number(rows[0].count)).toBe(1)
      expect(Number(rows[0].gross_cents)).toBe(12_105)
      expect(Number(rows[0].net_cents)).toBe(10_087)
      expect(Number(rows[0].commission_cents)).toBe(2_017)
      expect(rows[0].status).toBe('pending')
      expect(Date.parse(rows[0].available_at) - Date.parse(rows[0].paid_at)).toBe(14 * 24 * 60 * 60 * 1000)
    })
  })

  it('reverses a pre-hold refund in the append-only ledger', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      const subscriptionId = crypto.randomUUID()
      await newAttribution(db, partnerId, referredUserId)
      await newTransaction(db, referredUserId, 'charge', 'succeeded', subscriptionId)
      await newTransaction(db, referredUserId, 'refund', 'succeeded', subscriptionId, -12_105)

      const { rows: commissions } = await db.query<{ status: string; reversal_kind: string | null }>(
        'select status, reversal_kind from public.referral_commissions',
      )
      const { rows: ledger } = await db.query<{ entry_type: string; amount_cents: string }>(
        'select entry_type, amount_cents::text from public.referral_commission_ledger order by created_at',
      )

      expect(commissions).toEqual([{ status: 'reversed', reversal_kind: 'pre_hold' }])
      expect(ledger).toHaveLength(2)
      expect(ledger.map((entry) => entry.entry_type)).toEqual(['commission', 'refund_pre_hold'])
      expect(ledger.reduce((sum, entry) => sum + Number(entry.amount_cents), 0)).toBe(0)
    })
  })

  it('matures a commission through sync and posts a post-hold refund as a negative adjustment', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      const subscriptionId = crypto.randomUUID()
      await newAttribution(db, partnerId, referredUserId)
      const transactionId = await newTransaction(db, referredUserId, 'charge', 'succeeded', subscriptionId)
      await matureCommission(db, transactionId)
      await db.query('select public.referral_sync_commissions($1::uuid)', [partnerId])

      const { rows: matured } = await db.query<{ status: string }>(
        'select status from public.referral_commissions where billing_transaction_id = $1',
        [transactionId],
      )
      expect(matured).toEqual([{ status: 'available' }])

      await db.query(`
        insert into public.referral_commission_ledger (
          partner_id, entry_type, amount_cents, available_at, dedupe_key
        ) values ($1, 'payout_request', -3000, clock_timestamp(), 'fixture:prior-spend')
      `, [partnerId])
      await newTransaction(db, referredUserId, 'refund', 'succeeded', subscriptionId, -12_105)

      const { rows: reversed } = await db.query<{ status: string; reversal_kind: string }>(
        'select status, reversal_kind from public.referral_commissions where billing_transaction_id = $1',
        [transactionId],
      )
      const { rows: adjustment } = await db.query<{ entry_type: string; amount_cents: string }>(
        "select entry_type, amount_cents::text from public.referral_commission_ledger where entry_type = 'refund_adjustment'",
      )
      const { rows: balance } = await db.query<{ amount_cents: string }>(
        'select sum(amount_cents)::text as amount_cents from public.referral_commission_ledger where partner_id = $1',
        [partnerId],
      )

      expect(reversed).toEqual([{ status: 'reversed', reversal_kind: 'post_hold' }])
      expect(adjustment).toEqual([{ entry_type: 'refund_adjustment', amount_cents: '-2017' }])
      expect(Number(balance[0].amount_cents)).toBe(-3_000)
    })
  })

  it('keeps a created commission after deleting the referred account and syncs idempotently', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      const attributionId = await newAttribution(db, partnerId, referredUserId)
      const subscriptionId = crypto.randomUUID()
      const transactionId = await newTransaction(db, referredUserId, 'charge', 'succeeded', subscriptionId)

      await db.query('select public.referral_sync_commissions($1::uuid)', [partnerId])
      await db.query('select public.referral_sync_commissions($1::uuid)', [partnerId])
      await db.query('delete from auth.users where id = $1', [referredUserId])

      const { rows: commissionRows } = await db.query<{ attribution_id: string; billing_transaction_id: string; commission_cents: string }>(
        `select attribution_id, billing_transaction_id, commission_cents::text
         from public.referral_commissions where attribution_id = $1`,
        [attributionId],
      )
      const { rows: detached } = await db.query<{ referred_user_id: string | null; transaction_user_id: string | null }>(`
        select attribution.referred_user_id, transaction_row.user_id as transaction_user_id
        from public.referral_attributions as attribution
        join public.billing_transactions as transaction_row on transaction_row.id = $1
        where attribution.id = $2
      `, [transactionId, attributionId])

      expect(commissionRows).toEqual([{ attribution_id: attributionId, billing_transaction_id: transactionId, commission_cents: '2017' }])
      expect(detached).toEqual([{ referred_user_id: null, transaction_user_id: null }])
      const { rows: counts } = await db.query<{ commissions: number; ledger_entries: number }>(`
        select
          (select count(*)::integer from public.referral_commissions where attribution_id = $1) as commissions,
          (select count(*)::integer from public.referral_commission_ledger where commission_id in
            (select id from public.referral_commissions where attribution_id = $1)) as ledger_entries
      `, [attributionId])
      expect(counts[0]).toEqual({ commissions: 1, ledger_entries: 1 })
    })
  })

  it('keeps commission persistence atomic with billing while isolating email enqueue failure', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      await newAttribution(db, partnerId, referredUserId)
      await db.exec(`
        create function public.fail_referral_email_enqueue() returns trigger
        language plpgsql as $$ begin
          if new.type = 'referral_commission_earned' then raise exception 'email queue unavailable'; end if;
          return new;
        end $$;
        create trigger fail_referral_email_enqueue
        before insert on public.notification_logs
        for each row execute function public.fail_referral_email_enqueue();
      `)

      await newTransaction(db, referredUserId, 'charge', 'succeeded', crypto.randomUUID())
      const { rows } = await db.query<{ commissions: number; ledger_entries: number }>(`
        select
          (select count(*)::integer from public.referral_commissions) as commissions,
          (select count(*)::integer from public.referral_commission_ledger) as ledger_entries
      `)
      expect(rows).toEqual([{ commissions: 1, ledger_entries: 1 }])
    })

    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const referredUserId = await newUser(db)
      await newAttribution(db, partnerId, referredUserId)
      await db.exec(`
        create function public.fail_referral_commission_insert() returns trigger
        language plpgsql as $$ begin raise exception 'commission persistence unavailable'; end $$;
        create trigger fail_referral_commission_insert
        before insert on public.referral_commissions
        for each row execute function public.fail_referral_commission_insert();
      `)

      await expect(newTransaction(db, referredUserId, 'charge', 'succeeded', crypto.randomUUID()))
        .rejects.toThrow('commission persistence unavailable')
      const { rows } = await db.query<{ billing_transactions: number; commissions: number }>(`
        select
          (select count(*)::integer from public.billing_transactions) as billing_transactions,
          (select count(*)::integer from public.referral_commissions) as commissions
      `)
      expect(rows).toEqual([{ billing_transactions: 0, commissions: 0 }])
    })
  })

  it('deduplicates signup notices, limits immediate mail to five per hour, and rejects suspended partners', async () => {
    await withDatabase(async (db) => {
      const partnerId = await newPartner(db, await newUser(db))
      const attributionIds: string[] = []
      for (let index = 0; index < 7; index += 1) {
        attributionIds.push(await newAttribution(db, partnerId, await newUser(db)))
      }

      for (const attributionId of attributionIds) {
        await db.query('select public.referral_queue_signup_notification($1::uuid)', [attributionId])
      }
      const { rows: logs } = await db.query<{ type: string; count: number }>(
        'select type, count(*)::integer as count from public.notification_logs group by type order by type',
      )
      const { rows: digest } = await db.query<{ signup_count: number }>(`
        select (body::jsonb ->> 'signupCount')::integer as signup_count
        from public.notification_logs where type = 'referral_partner_signup_digest'
      `)
      const { rows: duplicate } = await db.query<{ result: { duplicate?: boolean } }>(
        'select public.referral_queue_signup_notification($1::uuid) as result',
        [attributionIds[0]],
      )

      expect(logs).toEqual([
        { type: 'referral_partner_signup', count: 5 },
        { type: 'referral_partner_signup_digest', count: 1 },
      ])
      expect(digest).toEqual([{ signup_count: 2 }])
      expect(duplicate[0].result.duplicate).toBe(true)

      await db.query("update public.referral_partners set status = 'suspended' where id = $1", [partnerId])
      const suspendedAttribution = await newAttribution(db, partnerId, await newUser(db))
      const { rows: suspended } = await db.query<{ result: { ok?: boolean; error?: string } }>(
        'select public.referral_queue_signup_notification($1::uuid) as result',
        [suspendedAttribution],
      )
      expect(suspended[0].result).toMatchObject({ ok: false, error: 'partner_inactive' })
    })
  })
})
