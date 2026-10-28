import { createAdminClient } from '@/lib/supabase/admin'
import { retrieveIyzicoCheckoutForm } from './iyzico'
import { extractPaidDetails } from './iyzico-paid-details'
import { settlePaymentResult } from './settle'
import {
  RECONCILABLE_KEY_PREFIXES,
  classifyRetrieval,
  isReconcilableLedgerKey,
  runReconciliation,
  type PendingPayment,
  type ReconcileDeps,
  type ReconcileSummary,
} from './reconcile'

const DEFAULT_LIMIT = 25

async function listPending(limit: number, userId?: string): Promise<PendingPayment[]> {
  const admin = createAdminClient()

  let ledgerQuery = admin
    .from('billing_transactions')
    .select('id, provider_ref, idempotency_key, created_at')
    .eq('status', 'pending')
    .eq('provider', 'iyzico')
    .not('provider_ref', 'is', null)
    .or(RECONCILABLE_KEY_PREFIXES.map((prefix) => `idempotency_key.like.${prefix}%`).join(','))
    .order('created_at', { ascending: true })
    .limit(limit)
  if (userId) ledgerQuery = ledgerQuery.eq('user_id', userId)

  let addonQuery = admin
    .from('addon_purchases')
    .select('id, provider_ref, created_at')
    .eq('status', 'pending')
    .eq('provider', 'iyzico')
    .not('provider_ref', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (userId) addonQuery = addonQuery.eq('user_id', userId)

  const [ledger, addon] = await Promise.all([ledgerQuery, addonQuery])
  if (ledger.error) throw new Error(`reconcile_ledger_list_failed: ${ledger.error.message}`)
  if (addon.error) throw new Error(`reconcile_addon_list_failed: ${addon.error.message}`)

  const rows: PendingPayment[] = [
    ...(ledger.data ?? [])
      .filter((row) => isReconcilableLedgerKey(row.idempotency_key as string | null))
      .map((row) => ({
        id: row.id as string,
        source: 'ledger' as const,
        token: row.provider_ref as string,
        createdAt: row.created_at as string,
      })),
    ...(addon.data ?? []).map((row) => ({
      id: row.id as string,
      source: 'addon' as const,
      token: row.provider_ref as string,
      createdAt: row.created_at as string,
    })),
  ]
  rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return rows.slice(0, limit)
}

const productionDeps = (userId?: string): ReconcileDeps => ({
  now: () => Date.now(),
  listPending: (limit) => listPending(limit, userId),
  retrieve: async (token) => {
    try {
      return classifyRetrieval(await retrieveIyzicoCheckoutForm(token))
    } catch {
      // Network, timeout, HTTP or configuration trouble says nothing about the payment.
      return { kind: 'transient' }
    }
  },
  settle: async (token, status, raw) => {
    await settlePaymentResult('iyzico', {
      kind: 'payment',
      reference: token,
      status,
      ...(status === 'paid' && raw ? extractPaidDetails(raw) : {}),
    })
  },
  abandon: async (payment) => {
    const admin = createAdminClient()
    const table = payment.source === 'ledger' ? 'billing_transactions' : 'addon_purchases'
    const { error } = await admin.from(table).update({ status: 'abandoned' }).eq('id', payment.id).eq('status', 'pending')
    if (error) throw new Error(`reconcile_abandon_failed: ${error.message}`)
  },
})

/**
 * Settles or writes off stale pending iyzico payments. Never throws: a failure
 * is logged and reported through `errors`.
 */
export async function reconcilePendingPayments(options: {
  userId?: string
  limit?: number
  budgetMs?: number
} = {}): Promise<ReconcileSummary> {
  try {
    return await runReconciliation(productionDeps(options.userId), {
      limit: options.limit ?? DEFAULT_LIMIT,
      deadlineMs: options.budgetMs === undefined ? undefined : Date.now() + options.budgetMs,
    })
  } catch (error) {
    console.log('[v0] reconcile: sweep failed', error instanceof Error ? error.message : String(error))
    return { checked: 0, paid: 0, failed: 0, abandoned: 0, skippedYoung: 0, skippedTransient: 0, errors: 1 }
  }
}
