import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Account deletion blockers for registrar-held domains.
 *
 * Blocking is limited to what is still LIVE for the user:
 *   1. custom_domains rows with provider = 'domainnameapi' owned by the user
 *      (the user currently holds a registrar domain; deleting would orphan it);
 *   2. OPEN financial jobs: an order, transfer or renewal that has not reached a
 *      terminal state, or that is waiting on a manual refund.
 *
 * History does NOT block. After a hand-over, the previous owner keeps
 * domain_orders (status 'active') and completed domain_transfers rows purely as
 * history, and that must never stop them from deleting their account.
 * Ownership comes from custom_domains.user_id only.
 */

export const OPEN_ORDER_STATUSES = [
  'pending_payment',
  'payment_verified',
  'registration_pending',
  'registration_reconciliation_required',
  'manual_refund_required',
] as const

export const OPEN_TRANSFER_STATUSES = [
  'pending_payment',
  'payment_verified',
  'transfer_submitting',
  'transfer_pending',
  'transfer_reconciliation_required',
  'manual_refund_required',
] as const

export const OPEN_RENEWAL_STATUSES = [
  'pending_payment',
  'payment_verified',
  'renewal_submitting',
  'renewal_reconciliation_required',
  'manual_refund_required',
] as const

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

// A failed lookup must block deletion (fail closed): the caller treats the thrown error as a failed delete.
export async function getDomainDeletionBlockers(admin: SupabaseClient, userId: string): Promise<DomainDeletionBlockers> {
  const [domains, orders, transfers, renewals] = await Promise.all([
    admin.from('custom_domains').select('domain').eq('user_id', userId).eq('provider', 'domainnameapi'),
    admin
      .from('domain_orders')
      .select('id')
      .eq('user_id', userId)
      .in('status', [...OPEN_ORDER_STATUSES]),
    admin
      .from('domain_transfers')
      .select('id')
      .eq('user_id', userId)
      .in('status', [...OPEN_TRANSFER_STATUSES]),
    admin
      .from('domain_renewals')
      .select('id')
      .eq('user_id', userId)
      .in('status', [...OPEN_RENEWAL_STATUSES]),
  ])

  if (domains.error) throw new DomainDeletionGuardError('custom_domains', domains.error)
  if (orders.error) throw new DomainDeletionGuardError('domain_orders', orders.error)
  if (transfers.error) throw new DomainDeletionGuardError('domain_transfers', transfers.error)
  if (renewals.error) throw new DomainDeletionGuardError('domain_renewals', renewals.error)

  return {
    registrarDomains: (domains.data ?? []).map((row) => String((row as { domain: string }).domain)),
    openOrders: orders.data?.length ?? 0,
    openTransfers: transfers.data?.length ?? 0,
    openRenewals: renewals.data?.length ?? 0,
  }
}
