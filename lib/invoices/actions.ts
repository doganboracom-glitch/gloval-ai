'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLING_PROFILE_COLUMNS, toBillingProfileSummary, type BillingProfileDatabaseRow } from '@/lib/billing-profile-store'
import { checkInvoiceLimit, type InvoiceLimitKind } from '@/lib/invoices/limit'
import { convertUploadedToNotRequired, exportInvoicesCsv, markNotRequired, type MarkNotRequiredResult } from '@/lib/invoices/service'
import { parseInvoiceFilters } from '@/lib/invoices/filter'
import type { BillingProfileSummary } from '@/lib/billing-profile-types'
import type { BillingSnapshot } from '@/lib/invoices/snapshot'
import type { InvoiceActionError } from '@/lib/invoices/types'

type Guarded = { ok: true; actor: { userId: string; email: string } } | { ok: false; error: InvoiceActionError }

async function guard(kind: InvoiceLimitKind): Promise<Guarded> {
  const actor = await getAdminUser().catch(() => null)
  if (!actor) return { ok: false, error: 'unauthorized' }
  const limit = await checkInvoiceLimit(actor.userId, kind)
  if (!limit.allowed) return { ok: false, error: 'rate_limited' }
  return { ok: true, actor }
}

export async function markInvoicesNotRequiredAction(
  transactionIds: unknown,
  reason: unknown,
): Promise<{ ok: true; result: MarkNotRequiredResult } | { ok: false; error: InvoiceActionError }> {
  const access = await guard('write')
  if (!access.ok) return access
  const outcome = await markNotRequired(access.actor, transactionIds, reason)
  if (!outcome.ok) return outcome
  revalidatePath('/admin/billing/invoices')
  const { ok: _ok, ...result } = outcome
  return { ok: true, result }
}

export async function convertInvoiceToNotRequiredAction(
  transactionId: unknown,
  reason: unknown,
): Promise<{ ok: true } | { ok: false; error: InvoiceActionError }> {
  const access = await guard('write')
  if (!access.ok) return access
  const outcome = await convertUploadedToNotRequired(access.actor, transactionId, reason)
  if (!outcome.ok) return outcome
  revalidatePath('/admin/billing/invoices')
  return { ok: true }
}

export async function exportInvoicesCsvAction(
  rawFilters: unknown,
): Promise<{ ok: true; csv: string; count: number; filename: string } | { ok: false; error: InvoiceActionError }> {
  const access = await guard('export')
  if (!access.ok) return access
  const params = rawFilters && typeof rawFilters === 'object' ? (rawFilters as Record<string, string>) : {}
  const filters = parseInvoiceFilters({
    status: params.status,
    category: params.category,
    test: params.showTest ? '1' : '',
    from: params.from,
    to: params.to,
    q: params.q,
  })
  const outcome = await exportInvoicesCsv(access.actor, filters)
  if (!outcome.ok) return outcome
  const stamp = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { ok: true, csv: outcome.csv, count: outcome.count, filename: `gloval-faturalar-${stamp}.csv` }
}

export type InvoiceDetail = {
  userId: string | null
  profile: BillingProfileSummary | null
  /** The frozen copy on an issued invoice, without identity or tax numbers. */
  snapshot: Omit<BillingSnapshot, 'taxNumber' | 'nationalId'> | null
}

/** Billing details for one payment's customer. Identity and tax numbers stay masked; the existing audited reveal action handles them. */
export async function getInvoiceDetailAction(
  transactionId: unknown,
): Promise<{ ok: true; detail: InvoiceDetail } | { ok: false; error: InvoiceActionError }> {
  const access = await guard('write')
  if (!access.ok) return access
  if (typeof transactionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(transactionId)) return { ok: false, error: 'invalid_input' }

  const admin = createAdminClient()
  const { data: tx } = await admin.from('billing_transactions').select('id, user_id').eq('id', transactionId).maybeSingle()
  if (!tx) return { ok: false, error: 'not_found' }
  const userId = (tx as { user_id: string | null }).user_id

  const [{ data: profile }, { data: invoice }] = await Promise.all([
    userId ? admin.from('billing_profiles').select(BILLING_PROFILE_COLUMNS).eq('user_id', userId).maybeSingle() : { data: null },
    admin.from('invoices').select('billing_snapshot').eq('billing_transaction_id', transactionId).maybeSingle(),
  ])

  let snapshot: InvoiceDetail['snapshot'] = null
  const stored = (invoice as { billing_snapshot: BillingSnapshot | null } | null)?.billing_snapshot
  if (stored) {
    const { taxNumber: _tax, nationalId: _id, ...safe } = stored
    snapshot = safe
  }
  return {
    ok: true,
    detail: {
      userId,
      profile: profile ? toBillingProfileSummary(profile as BillingProfileDatabaseRow) : null,
      snapshot,
    },
  }
}
