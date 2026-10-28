import { createAdminClient } from '@/lib/supabase/admin'
import { retrieveIyzicoCheckoutForm } from './iyzico'
import { extractPaidDetails } from './iyzico-paid-details'
import { settlePaymentResult } from './settle'
import {
  ABANDONED_RESCAN_WINDOW_MS,
  RECONCILABLE_KEY_PREFIXES,
  classifyRetrieval,
  emptyReconcileSummary,
  isReconcilableLedgerKey,
  runCloseCheckout,
  runReconciliation,
  type CloseDeps,
  type CloseOutcome,
  type PendingPayment,
  type ReconcileDeps,
  type ReconcileSummary,
} from './reconcile'

const DEFAULT_LIMIT = 25

type ListOptions = {
  status: 'pending' | 'abandoned'
  limit: number
  userId?: string
  /** Only rows created at/after this ISO instant. */
  sinceIso?: string
  newestFirst?: boolean
}

async function listByStatus(options: ListOptions): Promise<PendingPayment[]> {
  const { status, limit, userId, sinceIso, newestFirst = false } = options
  const admin = createAdminClient()

  let ledgerQuery = admin
    .from('billing_transactions')
    .select('id, provider_ref, idempotency_key, created_at')
    .eq('status', status)
    .eq('provider', 'iyzico')
    .not('provider_ref', 'is', null)
    .or(RECONCILABLE_KEY_PREFIXES.map((prefix) => `idempotency_key.like.${prefix}%`).join(','))
    .order('created_at', { ascending: !newestFirst })
    .limit(limit)
  if (userId) ledgerQuery = ledgerQuery.eq('user_id', userId)
  if (sinceIso) ledgerQuery = ledgerQuery.gte('created_at', sinceIso)

  let addonQuery = admin
    .from('addon_purchases')
    .select('id, provider_ref, created_at')
    .eq('status', status)
    .eq('provider', 'iyzico')
    .not('provider_ref', 'is', null)
    .order('created_at', { ascending: !newestFirst })
    .limit(limit)
  if (userId) addonQuery = addonQuery.eq('user_id', userId)
  if (sinceIso) addonQuery = addonQuery.gte('created_at', sinceIso)

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
        status,
      })),
    ...(addon.data ?? []).map((row) => ({
      id: row.id as string,
      source: 'addon' as const,
      token: row.provider_ref as string,
      createdAt: row.created_at as string,
      status,
    })),
  ]
  const direction = newestFirst ? -1 : 1
  rows.sort((a, b) => direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
  return rows.slice(0, limit)
}

/**
 * `pending` rows first (oldest first), then — with whatever capacity is left —
 * the newest `abandoned` rows of the last 24 hours, so a late SUCCESS on a
 * written-off checkout is still picked up. Bounded by `limit` in total.
 */
async function listForSweep(limit: number, userId?: string): Promise<PendingPayment[]> {
  const pending = await listByStatus({ status: 'pending', limit, userId })
  const remaining = limit - pending.length
  if (remaining <= 0) return pending
  const abandoned = await listByStatus({
    status: 'abandoned',
    limit: remaining,
    userId,
    sinceIso: new Date(Date.now() - ABANDONED_RESCAN_WINDOW_MS).toISOString(),
    newestFirst: true,
  })
  return [...pending, ...abandoned]
}

const providerDeps = (): Pick<ReconcileDeps, 'retrieve' | 'settle' | 'abandon'> => ({
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
  // Conditional on `pending`, so a callback/cron that settled the row first wins.
  abandon: async (payment) => {
    const admin = createAdminClient()
    const table = payment.source === 'ledger' ? 'billing_transactions' : 'addon_purchases'
    const { error } = await admin.from(table).update({ status: 'abandoned' }).eq('id', payment.id).eq('status', 'pending')
    if (error) throw new Error(`reconcile_abandon_failed: ${error.message}`)
  },
})

const productionDeps = (userId?: string): ReconcileDeps => ({
  now: () => Date.now(),
  listPending: (limit) => listForSweep(limit, userId),
  ...providerDeps(),
})

/**
 * Settles or writes off stale pending iyzico payments, and re-checks recently
 * abandoned ones for a late SUCCESS. Never throws: a failure is logged and
 * reported through `errors`.
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
    return { ...emptyReconcileSummary(), errors: 1 }
  }
}

const closeDeps = (userId: string, sinceMs: number): CloseDeps => ({
  // Always scoped to `userId`: another user's record can never be selected.
  findNewestPending: async () => {
    const [newest] = await listByStatus({
      status: 'pending',
      limit: 1,
      userId,
      sinceIso: new Date(sinceMs).toISOString(),
      newestFirst: true,
    })
    return newest ?? null
  },
  ...providerDeps(),
})

/**
 * The signed-in buyer closed the iyzico window. Settles the checkout if it was
 * in fact paid, otherwise writes it off as `abandoned` right away; provider
 * trouble leaves it for the cron. Idempotent and never throws.
 */
export async function closePendingCheckoutForUser(userId: string, sinceMs: number): Promise<CloseOutcome> {
  try {
    return await runCloseCheckout(closeDeps(userId, sinceMs))
  } catch (error) {
    console.log('[v0] close checkout failed', error instanceof Error ? error.message : String(error))
    return 'unchanged'
  }
}
