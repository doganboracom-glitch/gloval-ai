import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const ADMIN_SQL = readFileSync(path.join(ROOT, 'scripts/098-referral-partner-events.sql'), 'utf8')
const COMMISSION_SQL = readFileSync(path.join(ROOT, 'scripts/099-referral-commission-ledger.sql'), 'utf8')
const PAYOUT_SQL = readFileSync(path.join(ROOT, 'scripts/100-referral-payout-workflows.sql'), 'utf8')
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
create table public.ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  kind text not null,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);
`

type RpcResult = Record<string, unknown>

async function withDatabase<T>(run: (db: PGlite) => Promise<T>): Promise<T> {
  const db = new PGlite()
  try {
    await db.exec(BASE_SCHEMA)
    await db.exec(CORE_SQL)
    await db.exec(ADMIN_SQL)
    await db.exec(COMMISSION_SQL)
    await db.exec(PAYOUT_SQL)
    return await run(db)
  } finally {
    await db.close()
  }
}

async function newUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  return rows[0].id
}

async function newPartner(
  db: PGlite,
  options: { email: string; taxStatus?: 'individual' | 'company'; status?: 'active' | 'suspended' },
) {
  const userId = await newUser(db, options.email)
  const { rows } = await db.query<{ id: string; user_id: string }>(`
    insert into public.referral_partners (
      user_id, referral_code, status, preferred_language, payee_name, tax_status,
      iban_ciphertext, iban_key_version, iban_last4
    ) values (
      $1, $2, $3, 'tr', 'Test Partner', $4, 'encrypted-value', 'v1', '1234'
    ) returning id, user_id
  `, [
    userId,
    `PARTNER${String(options.email.length).padStart(2, '0')}`,
    options.status ?? 'active',
    options.taxStatus ?? 'individual',
  ])
  return rows[0]
}

async function addAvailableBalance(db: PGlite, partnerId: string, amountCents: number, key: string) {
  await db.query(`
    insert into public.referral_commission_ledger (
      partner_id, entry_type, amount_cents, available_at, dedupe_key
    ) values ($1, 'commission', $2, clock_timestamp() - interval '1 second', $3)
  `, [partnerId, amountCents, `fixture:${key}`])
}

async function requestPayout(
  db: PGlite,
  partnerId: string,
  userId: string,
  method: 'cash' | 'credit',
  idempotencyKey = crypto.randomUUID(),
): Promise<RpcResult> {
  const { rows } = await db.query<{ result: RpcResult }>(
    'select public.request_referral_payout($1::uuid, $2::uuid, $3, $4::uuid) as result',
    [partnerId, userId, method, idempotencyKey],
  )
  return rows[0].result
}

describe('scripts/100-referral-payout-workflows.sql', () => {
  it('converts the full available balance atomically and safely retries the same request', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'credit-partner@gloval.test' })
      await addAvailableBalance(db, partner.id, 100_001, 'credit-100001')
      const idempotencyKey = crypto.randomUUID()

      const result = await requestPayout(db, partner.id, partner.user_id, 'credit', idempotencyKey)
      const duplicate = await requestPayout(db, partner.id, partner.user_id, 'credit', idempotencyKey)
      const { rows: payoutRows } = await db.query<{
        method: string
        status: string
        balance_cents: string
        payout_cents: string
        credit_amount: number
        system_topup_cents: string
        processed_at: string | null
      }>(`select method, status, balance_cents::text, payout_cents::text, credit_amount,
          system_topup_cents::text, processed_at::text from public.referral_payout_requests`)
      const { rows: credits } = await db.query<{ kind: string; amount: number; reason: string }>(
        'select kind, amount, reason from public.ai_credit_transactions',
      )
      const { rows: ledger } = await db.query<{ amount_cents: string }>(
        'select amount_cents::text from public.referral_commission_ledger order by created_at',
      )

      expect(result).toMatchObject({ ok: true, duplicate: false, method: 'credit', status: 'processed', balanceCents: 100_001, payoutCents: 100_001, creditAmount: 334, systemTopupCents: 199 })
      expect(duplicate).toMatchObject({ ok: true, duplicate: true, status: 'processed' })
      expect(payoutRows).toHaveLength(1)
      expect(payoutRows[0]).toMatchObject({ method: 'credit', status: 'processed', balance_cents: '100001', payout_cents: '100001', credit_amount: 334, system_topup_cents: '199' })
      expect(payoutRows[0].processed_at).toBeTruthy()
      expect(credits).toEqual([{ kind: 'grant', amount: 334, reason: `referral_payout:${result.requestId}` }])
      expect(ledger.map((row) => Number(row.amount_cents))).toEqual([100_001, -100_001])
    })
  })

  it('rejects an under-minimum request and rolls back the entire credit conversion on ledger failure', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'atomic-partner@gloval.test' })
      await addAvailableBalance(db, partner.id, 99_999, 'under-minimum')
      await expect(requestPayout(db, partner.id, partner.user_id, 'credit')).resolves.toMatchObject({
        ok: false,
        error: 'minimum_not_met',
      })
      const { rows: underMinimum } = await db.query<{ count: number }>(
        'select count(*)::integer as count from public.referral_payout_requests',
      )
      expect(underMinimum[0].count).toBe(0)
      const adminUserId = await newUser(db, 'close-admin@gloval.test')
      const closeWithBalance = await db.query<{ result: RpcResult }>(
        "select public.transition_referral_partner_status($1::uuid, $2::uuid, 'close') as result",
        [partner.id, adminUserId],
      )
      expect(closeWithBalance.rows[0].result).toMatchObject({ ok: false, error: 'balance_outstanding', balanceCents: 99_999 })

      await addAvailableBalance(db, partner.id, 100_000, 'atomic-failure')
      await db.exec(`
        create function public.reject_referral_credit_insert() returns trigger
        language plpgsql as $$ begin raise exception 'credit ledger unavailable'; end $$;
        create trigger reject_referral_credit_insert
        before insert on public.ai_credit_transactions
        for each row execute function public.reject_referral_credit_insert();
      `)
      await expect(requestPayout(db, partner.id, partner.user_id, 'credit')).rejects.toThrow('credit ledger unavailable')

      const { rows: rollbackState } = await db.query<{ requests: number; credits: number; balance_cents: string }>(`
        select
          (select count(*)::integer from public.referral_payout_requests) as requests,
          (select count(*)::integer from public.ai_credit_transactions) as credits,
          (select sum(amount_cents)::text from public.referral_commission_ledger where partner_id = $1) as balance_cents
      `, [partner.id])
      expect(rollbackState).toEqual([{ requests: 0, credits: 0, balance_cents: '199999' }])
    })
  })

  it('enforces one open cash request, computes VAT, requires an invoice, and suspends until tax verification', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'company-partner@gloval.test', taxStatus: 'company' })
      const adminUserId = await newUser(db, 'admin@gloval.test')
      await addAvailableBalance(db, partner.id, 200_000, 'company-cash')

      const cashKey = crypto.randomUUID()
      const cash = await requestPayout(db, partner.id, partner.user_id, 'cash', cashKey)
      const duplicateCash = await requestPayout(db, partner.id, partner.user_id, 'cash', cashKey)
      const secondCash = await requestPayout(db, partner.id, partner.user_id, 'cash')

      expect(cash).toMatchObject({ ok: true, duplicate: false, status: 'requested', balanceCents: 200_000, payoutCents: 240_000, invoiceRequired: true })
      expect(duplicateCash).toMatchObject({ ok: true, duplicate: true })
      expect(secondCash).toMatchObject({ ok: false, error: 'open_cash_request' })
      const closeWithOpenCash = await db.query<{ result: RpcResult }>(
        "select public.transition_referral_partner_status($1::uuid, $2::uuid, 'close') as result",
        [partner.id, adminUserId],
      )
      expect(closeWithOpenCash.rows[0].result).toMatchObject({ ok: false, error: 'balance_outstanding', openCashRequest: true })
      const revealAudit = await db.query<{ result: boolean }>(
        'select public.record_referral_payout_iban_reveal($1::uuid, $2::uuid, $3::uuid) as result',
        [partner.id, cash.requestId, adminUserId],
      )
      const { rows: revealEvents } = await db.query<{ details: Record<string, unknown> }>(
        "select details from public.referral_payout_audit_events where event_type = 'iban_revealed'",
      )
      expect(revealAudit.rows[0].result).toBe(true)
      expect(revealEvents).toEqual([{ details: { last4: '1234' } }])

      await addAvailableBalance(db, partner.id, 100_000, 'credit-with-open-cash')
      const creditWhileCashOpen = await requestPayout(db, partner.id, partner.user_id, 'credit')
      expect(creditWhileCashOpen).toMatchObject({ ok: true, status: 'processed', balanceCents: 100_000, creditAmount: 334, systemTopupCents: 200 })

      const beforeInvoice = await db.query<{ result: RpcResult }>(
        'select public.process_referral_cash_payout($1::uuid, $2::uuid, $3) as result',
        [cash.requestId, adminUserId, 'BANK-REF-001'],
      )
      expect(beforeInvoice.rows[0].result).toMatchObject({ ok: false, error: 'invoice_confirmation_required' })

      const invoice = await db.query<{ result: RpcResult }>(
        'select public.record_referral_cash_invoice($1::uuid, $2::uuid, $3) as result',
        [cash.requestId, adminUserId, 'INV-2026-001'],
      )
      expect(invoice.rows[0].result).toMatchObject({ ok: true, duplicate: false })
      const duplicateInvoice = await db.query<{ result: RpcResult }>(
        'select public.record_referral_cash_invoice($1::uuid, $2::uuid, $3) as result',
        [cash.requestId, adminUserId, 'INV-2026-001'],
      )
      expect(duplicateInvoice.rows[0].result).toMatchObject({ ok: true, duplicate: true })

      const processed = await db.query<{ result: RpcResult }>(
        'select public.process_referral_cash_payout($1::uuid, $2::uuid, $3) as result',
        [cash.requestId, adminUserId, 'BANK-REF-001'],
      )
      expect(processed.rows[0].result).toMatchObject({ ok: true, alreadyProcessed: false, payoutCents: 240_000, invoiceRequired: true, taxSuspended: true })
      const retry = await db.query<{ result: RpcResult }>(
        'select public.process_referral_cash_payout($1::uuid, $2::uuid, $3) as result',
        [cash.requestId, adminUserId, 'BANK-REF-001'],
      )
      expect(retry.rows[0].result).toMatchObject({ ok: true, alreadyProcessed: true })

      const { rows: state } = await db.query<{ partner_status: string; tax_verified_at: string | null; request_status: string; audit_count: number }>(`
        select partner.status as partner_status, partner.tax_verified_at::text,
          payout.status as request_status,
          (select count(*)::integer from public.referral_payout_audit_events where event_type = 'cash_payout_paid') as audit_count
        from public.referral_partners as partner
        join public.referral_payout_requests as payout on payout.partner_id = partner.id
        where partner.id = $1 and payout.id = $2
      `, [partner.id, cash.requestId])
      expect(state).toEqual([{ partner_status: 'suspended', tax_verified_at: null, request_status: 'processed', audit_count: 1 }])

      const nextCashBeforeVerification = await requestPayout(db, partner.id, partner.user_id, 'cash')
      expect(nextCashBeforeVerification).toMatchObject({ ok: false, error: 'tax_verification_required' })
      const verified = await db.query<{ result: RpcResult }>(
        'select public.verify_referral_partner_tax($1::uuid, $2::uuid) as result',
        [partner.id, adminUserId],
      )
      expect(verified.rows[0].result).toMatchObject({ ok: true, alreadyVerified: false, status: 'active' })
      const { rows: reactivated } = await db.query<{ status: string; tax_verified_at: string | null; event_count: number }>(`
        select partner.status, partner.tax_verified_at::text,
          (select count(*)::integer from public.referral_partner_events where partner_id = partner.id and action = 'reactivate') as event_count
        from public.referral_partners as partner where partner.id = $1
      `, [partner.id])
      expect(reactivated[0].status).toBe('active')
      expect(reactivated[0].tax_verified_at).toBeTruthy()
      expect(reactivated[0].event_count).toBe(1)
    })
  })

  it('pays an individual at 1x and restores a rejected request to available balance exactly once', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'individual-partner@gloval.test' })
      const adminUserId = await newUser(db, 'admin-reject@gloval.test')
      await addAvailableBalance(db, partner.id, 100_000, 'individual-cash')

      const cash = await requestPayout(db, partner.id, partner.user_id, 'cash')
      expect(cash).toMatchObject({ ok: true, payoutCents: 100_000, invoiceRequired: false })
      const rejected = await db.query<{ result: RpcResult }>(
        'select public.reject_referral_cash_payout($1::uuid, $2::uuid, $3, $4) as result',
        [cash.requestId, adminUserId, 'details_incomplete', 'IBAN details need correction'],
      )
      expect(rejected.rows[0].result).toMatchObject({ ok: true, alreadyProcessed: false, reason: 'details_incomplete', balanceCents: 100_000 })
      const duplicate = await db.query<{ result: RpcResult }>(
        'select public.reject_referral_cash_payout($1::uuid, $2::uuid, $3, $4) as result',
        [cash.requestId, adminUserId, 'details_incomplete', 'IBAN details need correction'],
      )
      expect(duplicate.rows[0].result).toMatchObject({ ok: true, alreadyProcessed: true })

      const { rows: balance } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [partner.id],
      )
      expect(balance[0].result).toMatchObject({ ok: true, availableCents: 100_000, requestedCents: 0, paidCents: 0 })
      const { rows: ledger } = await db.query<{ amount_cents: string }>(
        'select amount_cents::text from public.referral_commission_ledger order by created_at',
      )
      expect(ledger.map((row) => Number(row.amount_cents))).toEqual([100_000, -100_000, 100_000])
    })
  })
})
