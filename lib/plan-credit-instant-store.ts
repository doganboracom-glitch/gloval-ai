import 'server-only'

import { after } from 'next/server'
import { claimNotification } from '@/lib/notify'
import { buildCreditNotice, creditNoticeDedupeKey } from '@/lib/credit-notice'
import { isBillingProfileIncompleteForNotice } from '@/lib/billing-profile-store'
import { isPlanCreditDryRun } from '@/lib/plan-credit-sweep'
import { loadPlanCreditSubscription, supabasePlanCreditStore } from '@/lib/plan-credit-sweep-store'
import {
  runInstantPlanCreditGrant,
  type CreditNoticeInput,
  type InstantCreditOutcome,
} from '@/lib/plan-credit-instant'

/**
 * In-app notice only (no e-mail): one `notification_logs` row per subscription
 * and credit period, claimed under a unique dedupe key so a replay stays silent.
 */
async function writeCreditNotice(input: CreditNoticeInput): Promise<void> {
  const billingProfileIncomplete = await isBillingProfileIncompleteForNotice(input.userId)
  const notice = buildCreditNotice({
    amount: input.amount,
    firstPeriod: input.firstPeriod,
    billingProfileIncomplete,
  })
  await claimNotification({
    userId: input.userId,
    type: notice.type,
    subject: notice.subject,
    body: notice.body,
    dedupeKey: creditNoticeDedupeKey(input.subscriptionId, input.periodStart),
  })
}

/**
 * Grants the plan credits of one subscription right now. Idempotent per credit
 * period, honours AI_CREDIT_GRANT_DRY_RUN (writes and notifies only when it is
 * exactly "false") and NEVER throws.
 */
export async function grantPlanCreditsForSubscription(subscriptionId: string): Promise<InstantCreditOutcome> {
  try {
    return await runInstantPlanCreditGrant(
      {
        store: supabasePlanCreditStore,
        loadSubscription: loadPlanCreditSubscription,
        dryRun: isPlanCreditDryRun(process.env.AI_CREDIT_GRANT_DRY_RUN),
        notify: writeCreditNotice,
      },
      subscriptionId,
    )
  } catch {
    return { status: 'error', code: 'grant_failed' }
  }
}

/**
 * Payment-path entry point: schedules the grant after the response with
 * `after()` so a payment callback is never delayed. Outside a request scope
 * (scripts, tests) it falls back to a detached promise. Cannot throw.
 */
export function grantPlanCreditsAfterPayment(subscriptionId: string): void {
  try {
    after(() => grantPlanCreditsForSubscription(subscriptionId))
  } catch {
    void grantPlanCreditsForSubscription(subscriptionId)
  }
}
