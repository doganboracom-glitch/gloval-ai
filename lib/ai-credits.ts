import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-only AI credit helpers.
 *
 * Reuses the existing append-only `ai_credit_transactions` ledger (the same
 * table the admin back office reads from in `lib/admin/queries.ts` and
 * writes to in `lib/admin/actions.ts#grantCredits`). Balance is always
 * `Σ amount` — we never store a mutable balance column.
 *
 * Actual consumption/refund goes through the `consume_ai_credits` /
 * `refund_ai_credits` Postgres functions (SECURITY DEFINER, service-role
 * only), which serialize concurrent calls for the same user with
 * `pg_advisory_xact_lock` so two simultaneous requests can never both pass
 * the balance check and double-spend.
 */

/** Cost, in AI credits, per server-side action. Kept in sync with the
 * marketing table in `lib/pricing-config.ts#CREDIT_COSTS` ("Metni düzelt/
 * yeniden yaz" = 1, "Bölüm içeriği oluştur" = 2). */
export const AI_ACTION_COSTS = {
  edit: 1,
  heroImage: 2,
  sectionImage: 2,
  /** Per generated logo alternative — see `app/api/logo-image/route.ts`. */
  logoImage: 2,
  /** Per AI "try it on" generation on a store product — see `app/api/try-on/route.ts`.
   *  Priced higher than the other actions: it composites a real customer
   *  photo with a product photo, which is a heavier generation than a plain
   *  text-to-image call, and it is charged to the STORE OWNER's balance on
   *  every buyer-initiated attempt (not gated behind the free daily limit
   *  the way owner-initiated edits are). */
  tryOn: 5,
} as const

export type AiActionCost = (typeof AI_ACTION_COSTS)[keyof typeof AI_ACTION_COSTS]

/** Current credit balance for a user (Σ amount over the ledger). */
export async function getCreditBalance(userId: string): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_credit_transactions')
    .select('amount')
    .eq('user_id', userId)

  if (error) {
    // Fail closed: if we can't read the ledger, treat the user as having no
    // credits rather than silently allowing free AI usage.
    console.error('[ai-credits] getCreditBalance failed:', error.message)
    return 0
  }

  return (data ?? []).reduce((sum, row) => sum + ((row.amount as number) ?? 0), 0)
}

/**
 * Full ledger rows (amount + timestamp) for the billing credit summary. Fails
 * closed to an empty ledger on a read error.
 */
export async function getCreditLedger(
  userId: string,
): Promise<Array<{ amount: number; created_at: string }>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_credit_transactions')
    .select('amount, created_at')
    .eq('user_id', userId)
  if (error) {
    console.error('[ai-credits] getCreditLedger failed:', error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    amount: (row.amount as number) ?? 0,
    created_at: row.created_at as string,
  }))
}

export type ConsumeCreditsResult = { ok: true; balance: number } | { ok: false; balance: number }

/**
 * Atomically consume `amount` credits for `userId` via the `consume_ai_credits`
 * RPC. Returns `{ ok: false }` (no ledger row written) if the balance is
 * insufficient.
 */
export async function consumeCredits(
  userId: string,
  amount: number,
  reason?: string,
): Promise<ConsumeCreditsResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .rpc('consume_ai_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason ?? null,
    })
    .maybeSingle()

  if (error || !data) {
    console.error('[ai-credits] consumeCredits failed:', error?.message)
    // Fail closed on RPC errors too — don't grant free AI usage on a DB hiccup.
    return { ok: false, balance: 0 }
  }

  // The generated Supabase types don't know this RPC's return row shape, so
  // the client falls back to `{}` — cast to the actual `(ok boolean, balance
  // int)` shape the migration defines.
  const row = data as { ok: boolean; balance: number }
  return { ok: Boolean(row.ok), balance: row.balance ?? 0 }
}

/**
 * Refund `amount` credits to `userId` via the `refund_ai_credits` RPC. Used
 * when an AI action is charged for optimistically but then fails/aborts
 * after the charge (currently unused by the edit/image routes, which check
 * success before charging — kept available for future use).
 */
export async function refundCredits(
  userId: string,
  amount: number,
  reason?: string,
): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('refund_ai_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason ?? null,
  })

  if (error) {
    console.error('[ai-credits] refundCredits failed:', error.message)
    return 0
  }

  return (data as number) ?? 0
}
