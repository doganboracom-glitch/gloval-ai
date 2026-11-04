import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, vi } from 'vitest'
import {
  AI_CREDIT_TRANSACTION_KIND_SQL,
  BILLING_TRANSACTION_KIND_SQL,
  REFERRAL_PAYOUT_CREDIT_KIND,
} from './referral-sql-test-kinds'
import { CREDIT_MIN_CENTS } from './commission-config'

vi.setConfig({ testTimeout: 30_000 })

const ROOT = process.cwd()
const CORE_SQL = readFileSync(path.join(ROOT, 'scripts/095-referral-core.sql'), 'utf8')
const ADMIN_SQL = readFileSync(path.join(ROOT, 'scripts/098-referral-partner-events.sql'), 'utf8')
const COMMISSION_SQL = readFileSync(path.join(ROOT, 'scripts/102-referral-commission-ledger.sql'), 'utf8')
const PAYOUT_SQL = readFileSync(path.join(ROOT, 'scripts/103-referral-payout-workflows.sql'), 'utf8')
const CREDIT_CONVERSION_SQL = readFileSync(path.join(ROOT, 'scripts/108-referral-credit-conversion.sql'), 'utf8')
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
  kind text not null check (kind in (${AI_CREDIT_TRANSACTION_KIND_SQL})),
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
    await db.exec(CREDIT_CONVERSION_SQL)
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

async function newCommission(db: PGlite, partnerId: string) {
  const referredUserId = await newUser(db, `referred-${crypto.randomUUID()}@gloval.test`)
  await db.query(`
    insert into public.referral_attributions
      (referred_user_id, partner_id, code_snapshot, source, captured_at)
    values ($1, $2, 'PARTNER01', 'email', now())
  `, [referredUserId, partnerId])
  const { rows: transactions } = await db.query<{ id: string }>(`
    insert into public.billing_transactions
      (user_id, subscription_id, kind, status, amount_cents)
    values ($1, $2, 'charge', 'succeeded', 12_105)
    returning id
  `, [referredUserId, crypto.randomUUID()])
  const { rows: commissions } = await db.query<{ id: string }>(
    'select id from public.referral_commissions where billing_transaction_id = $1',
    [transactions[0].id],
  )
  return { commissionId: commissions[0].id, transactionId: transactions[0].id }
}

async function addAvailableBalance(db: PGlite, partnerId: string, amountCents: number, key: string) {
  await db.query(`
    insert into public.referral_commission_ledger (
      partner_id, entry_type, amount_cents, available_at, dedupe_key
    ) values ($1, 'commission', $2, clock_timestamp() - interval '1 second', $3)
  `, [partnerId, amountCents, `fixture:${key}`])
}

async function addLedgerEntryAt(
  db: PGlite,
  partnerId: string,
  amountCents: number,
  availableAt: string,
  key: string,
  entryType: 'commission' | 'refund_pre_hold' = 'commission',
) {
  await db.query(`
    insert into public.referral_commission_ledger (
      partner_id, entry_type, amount_cents, available_at, dedupe_key
    ) values ($1, $2, $3, $4::timestamptz, $5)
  `, [partnerId, entryType, amountCents, availableAt, `fixture:${key}`])
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

describe('scripts/108-referral-credit-conversion.sql', () => {
  it('keeps both payout RPCs executable only by service_role', async () => {
    await withDatabase(async (db) => {
      const { rows } = await db.query<{
        balance_anon: boolean
        balance_authenticated: boolean
        balance_service_role: boolean
        request_anon: boolean
        request_authenticated: boolean
        request_service_role: boolean
      }>(`
        select
          has_function_privilege('anon', 'public.referral_partner_payout_balance(uuid)', 'EXECUTE') as balance_anon,
          has_function_privilege('authenticated', 'public.referral_partner_payout_balance(uuid)', 'EXECUTE') as balance_authenticated,
          has_function_privilege('service_role', 'public.referral_partner_payout_balance(uuid)', 'EXECUTE') as balance_service_role,
          has_function_privilege('anon', 'public.request_referral_payout(uuid,uuid,text,uuid)', 'EXECUTE') as request_anon,
          has_function_privilege('authenticated', 'public.request_referral_payout(uuid,uuid,text,uuid)', 'EXECUTE') as request_authenticated,
          has_function_privilege('service_role', 'public.request_referral_payout(uuid,uuid,text,uuid)', 'EXECUTE') as request_service_role
      `)

      expect(rows).toEqual([{
        balance_anon: false,
        balance_authenticated: false,
        balance_service_role: true,
        request_anon: false,
        request_authenticated: false,
        request_service_role: true,
      }])
    })
  })

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
      expect(credits).toEqual([{ kind: REFERRAL_PAYOUT_CREDIT_KIND, amount: 334, reason: `referral_payout:${result.requestId}` }])
      expect(ledger.map((row) => Number(row.amount_cents))).toEqual([100_001, -100_001])
    })
  })

  it('uses the 300-cent conversion minimum while crediting pending commissions without the cash hold', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'credit-minimum-boundary@gloval.test' })
      await addAvailableBalance(db, partner.id, CREDIT_MIN_CENTS - 1, 'credit-below-minimum')
      await expect(requestPayout(db, partner.id, partner.user_id, 'credit')).resolves.toMatchObject({
        ok: false,
        error: 'credit_minimum_not_met',
        availableCents: CREDIT_MIN_CENTS - 1,
      })

      await addAvailableBalance(db, partner.id, 1, 'credit-exact-minimum')
      const minimumCredit = await requestPayout(db, partner.id, partner.user_id, 'credit')
      expect(minimumCredit).toMatchObject({
        ok: true,
        balanceCents: CREDIT_MIN_CENTS,
        payoutCents: CREDIT_MIN_CENTS,
        creditAmount: 1,
        systemTopupCents: 0,
      })

      const pendingPartner = await newPartner(db, { email: 'credit-pending-commission@gloval.test' })
      const pendingCommission = await newCommission(db, pendingPartner.id)
      await addAvailableBalance(db, pendingPartner.id, 100, 'credit-pending-available')

      const { rows: before } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [pendingPartner.id],
      )
      expect(before[0].result).toMatchObject({
        pendingCents: 2_017,
        availableCents: 100,
        totalCents: 2_117,
        convertibleCents: 2_117,
      })

      const cash = await requestPayout(db, pendingPartner.id, pendingPartner.user_id, 'cash')
      expect(cash).toMatchObject({ ok: false, error: 'minimum_not_met', availableCents: 100 })

      const credit = await requestPayout(db, pendingPartner.id, pendingPartner.user_id, 'credit')
      expect(credit).toMatchObject({
        ok: true,
        balanceCents: 2_117,
        payoutCents: 2_117,
        creditAmount: 8,
        systemTopupCents: 283,
      })
      const { rows: convertedCommission } = await db.query<{ status: string; payout_request_id: string }>(
        'select status, payout_request_id from public.referral_commissions where id = $1',
        [pendingCommission.commissionId],
      )
      expect(convertedCommission).toEqual([{ status: 'converted', payout_request_id: credit.requestId }])

      const { rows: after } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [pendingPartner.id],
      )
      expect(after[0].result).toMatchObject({
        availableCents: 0,
        totalCents: 0,
        convertibleCents: 0,
        convertedCents: 2_117,
      })
      const { rows: availableLedger } = await db.query<{ balance_cents: string }>(`
        select coalesce(sum(amount_cents), 0)::text as balance_cents
        from public.referral_commission_ledger
        where partner_id = $1 and available_at <= clock_timestamp()
      `, [pendingPartner.id])
      expect(Number(availableLedger[0].balance_cents)).toBeGreaterThanOrEqual(0)
    })
  })

  it('clamps only available cents at zero while preserving the signed ledger totals', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'negative-available-balance@gloval.test' })
      await addLedgerEntryAt(
        db,
        partner.id,
        -400,
        new Date(Date.now() - 10_000).toISOString(),
        'negative-available-balance',
        'refund_pre_hold',
      )
      await addLedgerEntryAt(
        db,
        partner.id,
        1_000,
        new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        'positive-pending-balance',
      )

      const { rows } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [partner.id],
      )

      expect(rows[0].result).toMatchObject({
        pendingCents: 1_000,
        availableCents: 0,
        totalCents: 600,
        convertibleCents: 600,
      })
    })
  })

  it('balances each future maturity bucket and prevents credit double-spend after maturity', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'maturity-buckets@gloval.test' })
      const firstMaturity = new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString()
      const secondMaturity = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000).toISOString()
      const debtMaturity = new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000).toISOString()
      await addLedgerEntryAt(db, partner.id, 1_000, firstMaturity, 'first-maturity-a')
      await addLedgerEntryAt(db, partner.id, 1_000, firstMaturity, 'first-maturity-b')
      await addLedgerEntryAt(db, partner.id, 2_000, secondMaturity, 'second-maturity')
      await addLedgerEntryAt(db, partner.id, -300, debtMaturity, 'future-debt', 'refund_pre_hold')
      const idempotencyKey = crypto.randomUUID()

      const conversion = await requestPayout(db, partner.id, partner.user_id, 'credit', idempotencyKey)
      const duplicate = await requestPayout(db, partner.id, partner.user_id, 'credit', idempotencyKey)
      const newRequest = await requestPayout(db, partner.id, partner.user_id, 'credit')

      expect(conversion).toMatchObject({
        ok: true,
        duplicate: false,
        balanceCents: 3_700,
        creditAmount: 13,
        systemTopupCents: 200,
      })
      expect(duplicate).toMatchObject({ ok: true, duplicate: true, balanceCents: 3_700 })
      expect(newRequest).toMatchObject({ ok: false, error: 'credit_minimum_not_met', availableCents: 0 })

      const { rows: cohorts } = await db.query<{ balance_cents: string }>(`
        select sum(amount_cents)::text as balance_cents
        from public.referral_commission_ledger
        where partner_id = $1 and available_at > clock_timestamp()
        group by available_at
        order by available_at
      `, [partner.id])
      expect(cohorts.map((row) => Number(row.balance_cents))).toEqual([0, 0, 0])

      const { rows: futureBalance } = await db.query<{ balance_cents: string }>(`
        select coalesce(sum(amount_cents), 0)::text as balance_cents
        from public.referral_commission_ledger
        where partner_id = $1 and available_at <= $2::timestamptz
      `, [partner.id, new Date(Date.now() + 4 * 24 * 60 * 60 * 1_000).toISOString()])
      expect(Number(futureBalance[0].balance_cents)).toBe(0)

      const { rows: adjustments } = await db.query<{ amount_cents: string; dedupe_key: string }>(`
        select amount_cents::text, dedupe_key
        from public.referral_commission_ledger
        where payout_request_id = $1
        order by amount_cents, dedupe_key
      `, [conversion.requestId])
      expect(adjustments.map((row) => Number(row.amount_cents)).sort((a, b) => a - b)).toEqual([-2_000, -2_000, 300])
      expect(new Set(adjustments.map((row) => row.dedupe_key)).size).toBe(3)
      expect(adjustments.every((row) => row.dedupe_key.startsWith(`payout-request:${conversion.requestId}:`))).toBe(true)

      const { rows: balance } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [partner.id],
      )
      expect(balance[0].result).toMatchObject({
        pendingCents: 0,
        availableCents: 0,
        totalCents: 0,
        convertibleCents: 0,
        convertedCents: 3_700,
      })
      const { rows: creditTransactions } = await db.query<{ count: number; amount: number }>(`
        select count(*)::integer as count, coalesce(sum(amount), 0)::integer as amount
        from public.ai_credit_transactions
        where user_id = $1 and reason like 'referral_payout:%'
      `, [partner.user_id])
      expect(creditTransactions).toEqual([{ count: 1, amount: 13 }])
    })
  })

  it('deducts a pre-hold refund posted after conversion from the next credit conversion', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'refund-after-conversion@gloval.test' })
      const adminUserId = await newUser(db, 'refund-after-conversion-admin@gloval.test')
      const original = await newCommission(db, partner.id)
      const firstConversion = await requestPayout(db, partner.id, partner.user_id, 'credit')
      expect(firstConversion).toMatchObject({ ok: true, balanceCents: 2_017, creditAmount: 7 })

      const { rows: originalMaturity } = await db.query<{ available_at: string }>(`
        select available_at::text from public.referral_commissions where id = $1
      `, [original.commissionId])
      const reversal = await db.query<{ result: RpcResult }>(
        'select public.referral_admin_reverse_commission($1::uuid, $2::uuid, $3) as result',
        [original.commissionId, adminUserId, 'Refund received before the hold expires'],
      )
      expect(reversal.rows[0].result).toMatchObject({
        ok: true,
        reversalKind: 'pre_hold',
        entryType: 'refund_pre_hold',
      })

      const { rows: refundLedger } = await db.query<{ amount_cents: string; available_at: string }>(`
        select amount_cents::text, available_at::text
        from public.referral_commission_ledger
        where dedupe_key = $1
      `, [`commission-reversal:${original.commissionId}`])
      expect(refundLedger).toEqual([{
        amount_cents: '-2017',
        available_at: originalMaturity[0].available_at,
      }])

      await newCommission(db, partner.id)
      await newCommission(db, partner.id)
      const { rows: beforeNextConversion } = await db.query<{ balance_cents: string }>(`
        select coalesce(sum(amount_cents), 0)::text as balance_cents
        from public.referral_commission_ledger where partner_id = $1
      `, [partner.id])
      expect(Number(beforeNextConversion[0].balance_cents)).toBe(2_017)

      const nextConversion = await requestPayout(db, partner.id, partner.user_id, 'credit')
      expect(nextConversion).toMatchObject({
        ok: true,
        balanceCents: 2_017,
        creditAmount: 7,
        systemTopupCents: 83,
      })
      const { rows: remainingRefund } = await db.query<{ amount_cents: string }>(`
        select amount_cents::text
        from public.referral_commission_ledger
        where dedupe_key = $1
      `, [`commission-reversal:${original.commissionId}`])
      expect(remainingRefund).toEqual([{ amount_cents: '-2017' }])

      const { rows: finalBalance } = await db.query<{ result: RpcResult }>(
        'select public.referral_partner_payout_balance($1::uuid) as result',
        [partner.id],
      )
      expect(finalBalance[0].result).toMatchObject({
        totalCents: 0,
        convertibleCents: 0,
        convertedCents: 4_034,
      })
    })
  })

  it('records manual provider refunds in the commission ledger exactly once and audits the reason', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'manual-refund-partner@gloval.test' })
      const adminUserId = await newUser(db, 'manual-refund-admin@gloval.test')
      const preHold = await newCommission(db, partner.id)
      const postHold = await newCommission(db, partner.id)
      await db.query(`
        update public.referral_commissions
        set available_at = clock_timestamp() - interval '1 second'
        where id = $1
      `, [postHold.commissionId])

      const listed = await db.query<{ result: Array<Record<string, unknown>> }>(
        'select public.referral_commission_admin_list(100) as result',
      )
      expect(listed.rows[0].result).toHaveLength(2)
      expect(listed.rows[0].result.map((row) => row.commissionId)).toContain(preHold.commissionId)

      const invalidReason = await db.query<{ result: RpcResult }>(
        'select public.referral_admin_reverse_commission($1::uuid, $2::uuid, $3) as result',
        [preHold.commissionId, adminUserId, '  '],
      )
      expect(invalidReason.rows[0].result).toMatchObject({ ok: false, error: 'invalid_reason' })

      const reason = 'Refund confirmed in the Iyzico merchant panel'
      const preHoldResult = await db.query<{ result: RpcResult }>(
        'select public.referral_admin_reverse_commission($1::uuid, $2::uuid, $3) as result',
        [preHold.commissionId, adminUserId, reason],
      )
      const duplicate = await db.query<{ result: RpcResult }>(
        'select public.referral_admin_reverse_commission($1::uuid, $2::uuid, $3) as result',
        [preHold.commissionId, adminUserId, reason],
      )
      const postHoldResult = await db.query<{ result: RpcResult }>(
        'select public.referral_admin_reverse_commission($1::uuid, $2::uuid, $3) as result',
        [postHold.commissionId, adminUserId, 'Refund confirmed after the hold period'],
      )

      expect(preHoldResult.rows[0].result).toMatchObject({
        ok: true,
        alreadyProcessed: false,
        reversalKind: 'pre_hold',
        entryType: 'refund_pre_hold',
      })
      expect(duplicate.rows[0].result).toMatchObject({ ok: true, alreadyProcessed: true })
      expect(postHoldResult.rows[0].result).toMatchObject({
        ok: true,
        alreadyProcessed: false,
        reversalKind: 'post_hold',
        entryType: 'refund_adjustment',
      })

      const { rows: reversals } = await db.query<{
        commission_id: string
        entry_type: string
        amount_cents: string
        dedupe_key: string
      }>(`
        select commission_id, entry_type, amount_cents::text, dedupe_key
        from public.referral_commission_ledger
        where entry_type in ('refund_pre_hold', 'refund_adjustment')
        order by entry_type
      `)
      expect(reversals).toHaveLength(2)
      expect(reversals.map((row) => row.entry_type)).toEqual(['refund_adjustment', 'refund_pre_hold'])
      expect(reversals.every((row) => Number(row.amount_cents) < 0)).toBe(true)
      expect(new Set(reversals.map((row) => row.dedupe_key)).size).toBe(2)

      const { rows: audit } = await db.query<{ actor_user_id: string; event_type: string; details: Record<string, unknown> }>(`
        select actor_user_id, event_type, details
        from public.referral_payout_audit_events
        where event_type = 'commission_manual_reversed'
        order by created_at
      `)
      expect(audit).toHaveLength(2)
      expect(audit[0]).toMatchObject({
        actor_user_id: adminUserId,
        event_type: 'commission_manual_reversed',
        details: { source: 'manual_external_refund', reason },
      })
      const remaining = await db.query<{ result: Array<Record<string, unknown>> }>(
        'select public.referral_commission_admin_list(100) as result',
      )
      expect(remaining.rows[0].result).toEqual([])
    })
  })

  it('rejects an under-minimum request and rolls back the entire credit conversion on ledger failure', async () => {
    await withDatabase(async (db) => {
      const partner = await newPartner(db, { email: 'atomic-partner@gloval.test' })
      await addAvailableBalance(db, partner.id, CREDIT_MIN_CENTS - 1, 'under-minimum')
      await expect(requestPayout(db, partner.id, partner.user_id, 'credit')).resolves.toMatchObject({
        ok: false,
        error: 'credit_minimum_not_met',
        availableCents: CREDIT_MIN_CENTS - 1,
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
      expect(closeWithBalance.rows[0].result).toMatchObject({ ok: false, error: 'balance_outstanding', balanceCents: CREDIT_MIN_CENTS - 1 })

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
      expect(rollbackState).toEqual([{ requests: 0, credits: 0, balance_cents: String(CREDIT_MIN_CENTS - 1 + 100_000) }])
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

      await newCommission(db, partner.id)
      await addAvailableBalance(db, partner.id, 100_000, 'credit-with-open-cash')
      const creditWhileCashOpen = await requestPayout(db, partner.id, partner.user_id, 'credit')
      expect(creditWhileCashOpen).toMatchObject({ ok: true, status: 'processed', balanceCents: 102_017, creditAmount: 341, systemTopupCents: 283 })

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
