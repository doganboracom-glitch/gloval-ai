import {
  classifyPlanCreditSubscription,
  grantPlanCreditCandidate,
  type PlanCreditStore,
  type PlanCreditSubscription,
} from '@/lib/plan-credit-sweep'

/**
 * Instant plan-credit grant for ONE subscription, run right after a successful
 * payment so the customer does not wait for the daily sweep (which stays as the
 * safety net). Pure orchestration with injected I/O; the Supabase-backed wiring
 * and the `after()` scheduling live in `plan-credit-instant-store.ts`.
 *
 * It reuses the sweep's eligibility and grant functions, never throws, and logs
 * only subscription ids and amounts (no e-mails or names).
 */

export type CreditNoticeInput = {
  userId: string
  subscriptionId: string
  periodStart: string
  amount: number
  firstPeriod: boolean
}

export type InstantCreditDeps = {
  store: PlanCreditStore
  loadSubscription: (subscriptionId: string) => Promise<PlanCreditSubscription | null>
  /** True unless AI_CREDIT_GRANT_DRY_RUN is exactly "false". */
  dryRun: boolean
  /** In-app notice. Never called in dry-run and never for a 0-credit grant. */
  notify?: (input: CreditNoticeInput) => Promise<void>
  now?: Date
  log?: (line: string) => void
}

export type InstantCreditOutcome =
  | { status: 'granted'; amount: number; firstPeriod: boolean; notified: boolean }
  | { status: 'would_grant'; amount: number; firstPeriod: boolean }
  | { status: 'duplicate' }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; code: string }

export async function runInstantPlanCreditGrant(
  deps: InstantCreditDeps,
  subscriptionId: string,
): Promise<InstantCreditOutcome> {
  const outcome = await resolveOutcome(deps, subscriptionId)
  const log = deps.log ?? ((line: string) => console.log('[plan-credit-grant]', line))
  log(
    JSON.stringify({
      subscription: subscriptionId,
      dryRun: deps.dryRun,
      ...outcome,
    }),
  )
  return outcome
}

async function resolveOutcome(deps: InstantCreditDeps, subscriptionId: string): Promise<InstantCreditOutcome> {
  try {
    const sub = await deps.loadSubscription(subscriptionId)
    if (!sub) return { status: 'skipped', reason: 'subscription_not_found' }

    const classified = classifyPlanCreditSubscription(sub, deps.now ?? new Date())
    if ('skip' in classified) return { status: 'skipped', reason: classified.skip }
    const { candidate } = classified

    // Cheap pre-check; the RPC and the dry-run preview are idempotent as well,
    // so a failed lookup is not fatal.
    const existing = await deps.store.findGrantedReasons([candidate.reason]).catch(() => new Set<string>())
    if (existing.has(candidate.reason)) return { status: 'duplicate' }

    const result = await grantPlanCreditCandidate(deps.store, candidate, deps.dryRun)
    if (result.kind === 'already_granted') return { status: 'duplicate' }
    if (result.kind === 'would_grant') {
      return { status: 'would_grant', amount: result.entry.amount, firstPeriod: result.entry.firstPeriod }
    }

    const { amount, firstPeriod } = result.entry
    let notified = false
    if (amount > 0 && deps.notify) {
      try {
        await deps.notify({
          userId: sub.userId,
          subscriptionId: sub.id,
          periodStart: result.entry.periodStart,
          amount,
          firstPeriod,
        })
        notified = true
      } catch {
        // The credits are already written; a missing notice must not undo that.
      }
    }
    return { status: 'granted', amount, firstPeriod, notified }
  } catch {
    return { status: 'error', code: 'grant_failed' }
  }
}
