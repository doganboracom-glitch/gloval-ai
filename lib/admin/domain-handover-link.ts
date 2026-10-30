import type { CustomDomain } from '@/lib/custom-domains/types'

/**
 * Presentation-only rules for the "Devret" link in Admin > Alan Adları. This
 * decides which link a row shows; it never decides whether a handover is
 * allowed. The handover screen and the database functions enforce every real
 * precondition again.
 */

export type AdminDomainRow = CustomDomain & {
  ownerEmail: string | null
  /** Raw `custom_domains.provider` (e.g. `domainnameapi`). */
  provider: string | null
  /** Raw `custom_domains.order_id`. */
  orderId: string | null
  /** Raw `custom_domains.mail_transfer_hold_at`; set while mail is quarantined. */
  heldAt: string | null
}

export type HandoverBlockReason = 'not_registrar' | 'no_order' | 'not_active'

export type HandoverLinkState =
  | { kind: 'held' }
  | { kind: 'eligible' }
  | { kind: 'blocked'; reason: HandoverBlockReason }

export const HANDOVER_PATH = '/admin/domains/handover'

export function handoverHref(domain: string): string {
  return `${HANDOVER_PATH}?domain=${encodeURIComponent(domain)}`
}

export function handoverLinkState(
  row: Pick<AdminDomainRow, 'provider' | 'orderId' | 'status' | 'heldAt'>,
): HandoverLinkState {
  if (row.heldAt) return { kind: 'held' }
  if (row.provider !== 'domainnameapi') return { kind: 'blocked', reason: 'not_registrar' }
  if (!row.orderId) return { kind: 'blocked', reason: 'no_order' }
  if (row.status !== 'active') return { kind: 'blocked', reason: 'not_active' }
  return { kind: 'eligible' }
}
