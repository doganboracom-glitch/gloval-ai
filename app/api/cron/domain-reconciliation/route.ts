import { NextResponse } from 'next/server'
import { reconcileDomainOrders, sweepStaleOrders } from '@/lib/custom-domains/registrar/service'
import { getDomainProvider } from '@/lib/custom-domains/provider'
import { reconcileRenewals, sweepStaleRenewals } from '@/lib/custom-domains/registrar/renewal-service'
import { syncAllTransfers } from '@/lib/custom-domains/registrar/transfer-service'
import { reconcileSubscriptionLifecycle } from '@/lib/billing-lifecycle'
import { syncAllMailAccess } from '@/lib/mail/access-sync'
import { runPlanCreditSweep } from '@/lib/plan-credit-sweep-store'
import { releaseStaleOrderStock } from '@/lib/store-order-stock'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAIL_ACCESS_BUDGET_MS = 15_000
const PLAN_CREDITS_BUDGET_MS = 10_000
const CONNECTION_BATCH_LIMIT = 25
const CONNECTION_BUDGET_MS = 40_000

/** Inert until CRON_SECRET is set; Vercel Cron (see vercel.json) sends it as a Bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Billing runs first and in isolation: a failure in the (slower) domain
  // reconciliation below must never prevent expired subscriptions from being
  // processed, and a billing failure must not block domain work.
  let billing: Awaited<ReturnType<typeof reconcileSubscriptionLifecycle>> | { error: string }
  try {
    billing = await reconcileSubscriptionLifecycle()
  } catch (error) {
    console.log('[billing-lifecycle] sweep failed:', error)
    billing = { error: 'billing_sweep_failed' }
  }

  // Isolated like billing: the mailbox access sweep is the safety net for any
  // plan/add-on change that happened without an event hook (grace windows
  // elapsing, failed pushes to Mailcow, manual DB edits).
  let mailAccess: Awaited<ReturnType<typeof syncAllMailAccess>> | { error: string }
  try {
    mailAccess = await syncAllMailAccess({ deadlineMs: Date.now() + MAIL_ACCESS_BUDGET_MS })
  } catch (error) {
    console.log('[mail-access] sweep failed:', error)
    mailAccess = { error: 'mail_access_sweep_failed' }
  }

  // Isolated and time-boxed like the sweeps above. Runs after mail access; it
  // only reads subscriptions and calls the idempotent grant RPC, and stays a
  // dry run until AI_CREDIT_GRANT_DRY_RUN is explicitly set to "false".
  let aiCredits: Awaited<ReturnType<typeof runPlanCreditSweep>> | { error: string }
  try {
    aiCredits = await runPlanCreditSweep({ deadlineMs: Date.now() + PLAN_CREDITS_BUDGET_MS })
  } catch (error) {
    console.log('[plan-credits] sweep failed:', error instanceof Error ? error.message : 'unknown')
    aiCredits = { error: 'plan_credit_sweep_failed' }
  }

  // Isolated like the sweeps above: returns the stock held by abandoned,
  // never-paid store orders (all stores) so it cannot stay locked forever.
  // Without this the release only ran when that same store received a new checkout.
  let storeStock: { ok: true } | { error: string }
  try {
    await releaseStaleOrderStock(createAdminClient(), null)
    storeStock = { ok: true }
  } catch (error) {
    console.log('[store-stock] stale sweep failed:', error instanceof Error ? error.message : 'unknown')
    storeStock = { error: 'store_stock_sweep_failed' }
  }

  try {
    const sweptOrders = await sweepStaleOrders()
    const orders = await reconcileDomainOrders()
    const transfers = await syncAllTransfers()
    const sweptRenewals = await sweepStaleRenewals()
    const renewals = await reconcileRenewals()
    const provider = getDomainProvider()
    const connections =
      'refreshPendingConnections' in provider
        ? await (provider as { refreshPendingConnections(limit?: number, budgetMs?: number): Promise<number> }).refreshPendingConnections(
            CONNECTION_BATCH_LIMIT,
            CONNECTION_BUDGET_MS,
          )
        : 0
    return NextResponse.json({ ok: true, billing, mailAccess, aiCredits, storeStock, sweptOrders, orders, transfers, sweptRenewals, renewals, connections })
  } catch {
    return NextResponse.json({ error: 'reconciliation_failed', billing, aiCredits }, { status: 500 })
  }
}
