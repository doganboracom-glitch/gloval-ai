import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAddOnCode } from '@/lib/add-ons'
import {
  ADDON_PURCHASE_STATUSES,
  isAddOnPurchaseStatus,
  toAddOnPurchase,
  type AddOnPurchaseRow,
} from '@/lib/addon-purchases'

const sql = readFileSync(join(process.cwd(), 'scripts/019-addon-purchases.sql'), 'utf8')

describe('migration 019 (static contract)', () => {
  it('keeps the status check constraint in sync with ADDON_PURCHASE_STATUSES', () => {
    const match = sql.match(/status in \(([^)]*)\)\)/)
    expect(match).not.toBeNull()
    const inSql = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(inSql).toEqual([...ADDON_PURCHASE_STATUSES])
  })

  it('enforces a positive amount and a unique provider_ref', () => {
    expect(sql).toMatch(/amount integer not null check \(amount > 0\)/)
    expect(sql).toMatch(/constraint addon_purchases_provider_ref_key unique \(provider_ref\)/)
  })

  it('ties addon_code to the billing catalog', () => {
    expect(sql).toMatch(/addon_code text not null references public\.billing_plans \(code\)/)
  })

  it('enables RLS with an owner-only select policy and no write grants for clients', () => {
    expect(sql).toMatch(/alter table public\.addon_purchases enable row level security/)
    expect(sql).toMatch(/for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/)
    expect(sql).toMatch(/revoke all on public\.addon_purchases from public, anon, authenticated/)
    expect(sql).toMatch(/grant select on public\.addon_purchases to authenticated/)
    expect(sql).not.toMatch(/for (insert|update|delete|all)\s/i)
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i)
  })

  it('links one purchase to at most one entitlement without breaking existing rows', () => {
    expect(sql).toMatch(/add column if not exists purchase_id uuid/)
    expect(sql).toMatch(/on delete set null/)
    expect(sql).toMatch(/user_addon_entitlements_purchase_id_key unique \(purchase_id\)/)
    expect(sql).not.toMatch(/purchase_id uuid\s+not null/)
  })

  it('is idempotent', () => {
    expect(sql).toMatch(/create table if not exists public\.addon_purchases/)
    expect(sql).toMatch(/create index if not exists/g)
    expect(sql).toMatch(/drop policy if exists/)
    expect(sql).toMatch(/drop trigger if exists/)
  })
})

describe('addon purchase model', () => {
  const row: AddOnPurchaseRow = {
    id: 'p1',
    user_id: 'u1',
    subscription_id: 's1',
    addon_code: 'extra_site_1',
    amount: 9900,
    currency: 'TRY',
    period_end_snapshot: '2030-01-01T00:00:00Z',
    status: 'pending',
    provider: 'iyzico',
    provider_ref: null,
    created_at: '2029-12-01T00:00:00Z',
    updated_at: '2029-12-01T00:00:00Z',
  }

  it('recognises only the five valid statuses', () => {
    for (const s of ADDON_PURCHASE_STATUSES) expect(isAddOnPurchaseStatus(s)).toBe(true)
    expect(isAddOnPurchaseStatus('bogus')).toBe(false)
    expect(isAddOnPurchaseStatus(undefined)).toBe(false)
  })

  it('maps a valid row to the app model', () => {
    const purchase = toAddOnPurchase(row, isAddOnCode)
    expect(purchase).toMatchObject({
      id: 'p1',
      userId: 'u1',
      subscriptionId: 's1',
      addonCode: 'extra_site_1',
      amountCents: 9900,
      status: 'pending',
      providerRef: null,
    })
  })

  it('rejects rows with an unknown status or add-on code', () => {
    expect(toAddOnPurchase({ ...row, status: 'bogus' }, isAddOnCode)).toBeNull()
    expect(toAddOnPurchase({ ...row, addon_code: 'extra_site_999' }, isAddOnCode)).toBeNull()
  })
})
