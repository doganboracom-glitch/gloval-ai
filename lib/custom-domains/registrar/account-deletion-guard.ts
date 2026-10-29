import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Account deletion blockers for registrar-held domains.
 *
 * Blocking is limited to what is still LIVE for the user:
 *   1. custom_domains rows with provider = 'domainnameapi' owned by the user
 *      (the user currently holds a registrar domain; deleting would orphan it),
 *      EXCEPT a domain whose registration has already expired
 *      (expires_at in the past). An expired domain is no longer held; it only
 *      blocks through an open renewal, which is counted separately below;
 *   2. OPEN financial jobs: an order, transfer or renewal in a status the
 *      registrar flow is still working on, or waiting on a manual refund;
 *   3. a pending_payment record created within the last PENDING_PAYMENT_WINDOW_MS,
 *      because the buyer may still be completing payment at the PSP.
 *
 * History does NOT block. After a hand-over, the previous owner keeps
 * domain_orders (status 'active') and completed domain_transfers rows purely as
 * history, and that must never stop them from deleting their account.
 * Ownership comes from custom_domains.user_id only.
 *
 * Open-status lists are subsets of the live CHECK constraints
 * (domain_orders_status_check, domain_transfers_status_check,
 * domain_renewals_status_check).
 */

export const OPEN_ORDER_STATUSES = ['payment_verified', 'registration_pending'] as const

export const OPEN_TRANSFER_STATUSES = ['payment_verified', 'transfer_submitting', 'transfer_pending'] as const

export const OPEN_RENEWAL_STATUSES = [
  'payment_verified',
  'renewal_submitting',
  'renewal_reconciliation_required',
  'manual_refund_required',
] as const

export const PENDING_PAYMENT_WINDOW_MS = 2 * 60 * 60 * 1000

export type DomainDeletionBlockers = {
  registrarDomains: string[]
  openOrders: number
  openTransfers: number
  openRenewals: number
}

export class DomainDeletionGuardError extends Error {
  constructor(readonly stage: string, cause: unknown) {
    super(`domain deletion guard failed at ${stage}`)
    this.name = 'DomainDeletionGuardError'
    this.cause = cause
  }
}

export function hasDomainDeletionBlockers(blockers: DomainDeletionBlockers): boolean {
  return (
    blockers.registrarDomains.length > 0 ||
    blockers.openOrders > 0 ||
    blockers.openTransfers > 0 ||
    blockers.openRenewals > 0
  )
}

// An unparseable or missing expiry is NOT treated as expired, so it keeps blocking (fail closed).
function isExpired(expiresAt: unknown, now: Date): boolean {
  if (typeof expiresAt !== 'string') return false
  const time = Date.parse(expiresAt)
  return Number.isFinite(time) && time < now.getTime()
}

type OpenJobTable = 'domain_orders' | 'domain_transfers' | 'domain_renewals'

async function countOpenJobs(
  admin: SupabaseClient,
  table: OpenJobTable,
  userId: string,
  openStatuses: readonly string[],
  recentPendingSince: string,
): Promise<number> {
  const [open, recentPending] = await Promise.all([
    admin
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .in('status', [...openStatuses]),
    admin
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending_payment')
      .gte('created_at', recentPendingSince),
  ])
  if (open.error) throw new DomainDeletionGuardError(table, open.error)
  if (recentPending.error) throw new DomainDeletionGuardError(`${table}_pending_payment`, recentPending.error)
  return (open.data?.length ?? 0) + (recentPending.data?.length ?? 0)
}

// A failed lookup must block deletion (fail closed): the caller treats the thrown error as a failed delete.
export async function getDomainDeletionBlockers(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DomainDeletionBlockers> {
  const recentPendingSince = new Date(now.getTime() - PENDING_PAYMENT_WINDOW_MS).toISOString()

  const [domains, openOrders, openTransfers, openRenewals] = await Promise.all([
    admin.from('custom_domains').select('domain, expires_at').eq('user_id', userId).eq('provider', 'domainnameapi'),
    countOpenJobs(admin, 'domain_orders', userId, OPEN_ORDER_STATUSES, recentPendingSince),
    countOpenJobs(admin, 'domain_transfers', userId, OPEN_TRANSFER_STATUSES, recentPendingSince),
    countOpenJobs(admin, 'domain_renewals', userId, OPEN_RENEWAL_STATUSES, recentPendingSince),
  ])

  if (domains.error) throw new DomainDeletionGuardError('custom_domains', domains.error)

  const heldDomains = (domains.data ?? []) as Array<{ domain: string; expires_at: string | null }>

  return {
    registrarDomains: heldDomains.filter((row) => !isExpired(row.expires_at, now)).map((row) => String(row.domain)),
    openOrders,
    openTransfers,
    openRenewals,
  }
}
