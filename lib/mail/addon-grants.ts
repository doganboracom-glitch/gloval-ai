import { ADD_ONS, isAddOnCode } from '@/lib/add-ons'
import { subscriptionSourceEndsAt } from './access-state'
import type { MailAddonGrant } from './mailbox-limits'

/**
 * Pure mapping from `user_addon_entitlements` rows (kind = 'mail') to the
 * grants the mail access state and mailbox limit consume. No I/O.
 */

const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

export type MailAddonSubscriptionRow = {
  status: string
  current_period_end: string | null
  grace_period_ends_at: string | null
  updated_at: string | null
}

export type MailAddonEntitlementRow = {
  addon_code: string
  status: string
  starts_at: string | null
  expires_at: string | null
  subscription_id: string | null
  billing_subscriptions: MailAddonSubscriptionRow | MailAddonSubscriptionRow[] | null
}

/**
 * One grant per active mail entitlement.
 *
 * - Capacity comes from the catalog (`ADD_ONS`) by code, never from the row.
 * - The add-on lives and dies with the subscription it was bought on: its
 *   validity is that subscription's live state (same rules as a plan source,
 *   including the past_due billing window).
 * - A row with no live subscription cannot entitle; `expires_at` (the period
 *   end captured at grant time) is only used to date when it stopped.
 * - Unknown codes, non-mail codes and non-active rows are skipped.
 */
export function mailAddonGrantsFromRows(
  rows: readonly MailAddonEntitlementRow[],
  now: Date = new Date(),
): MailAddonGrant[] {
  const grants: MailAddonGrant[] = []
  for (const row of rows) {
    if (row.status !== 'active') continue
    if (!isAddOnCode(row.addon_code)) continue
    const def = ADD_ONS[row.addon_code]
    if (def.kind !== 'mail') continue

    const sub = Array.isArray(row.billing_subscriptions)
      ? (row.billing_subscriptions[0] ?? null)
      : row.billing_subscriptions
    const started = !row.starts_at || new Date(row.starts_at) <= now

    if (!sub) {
      grants.push({ capacity: def.capacity, entitled: false, endsAt: row.expires_at, endedAt: row.expires_at })
      continue
    }

    const entitled = started && ENTITLING_STATUSES.has(sub.status)
    grants.push({
      capacity: def.capacity,
      entitled,
      endsAt: subscriptionSourceEndsAt(sub.status, sub.current_period_end, sub.grace_period_ends_at),
      endedAt: entitled ? null : (sub.updated_at ?? row.expires_at),
    })
  }
  return grants
}
