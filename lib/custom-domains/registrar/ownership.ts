import { createAdminClient } from '@/lib/supabase/admin'
import { listDomainsForUser } from '../service'

/**
 * A registrar-side operation is allowed only on a domain this user holds AND that
 * we registered or transferred in.
 *
 * Ownership comes from `custom_domains.user_id` (via `listDomainsForUser`), never
 * from the order tables: after an ownership transfer the previous owner keeps the
 * `domain_orders` / `domain_transfers` rows as history, while `custom_domains`
 * follows the new owner.
 *
 * The "we got this from the registrar" proof is the row's own `order_id`, which
 * points at an active `domain_orders` row or a completed `domain_transfers` row.
 * That lookup is deliberately NOT filtered by user: the order may belong to the
 * previous owner. It is still pinned to the same domain name and a live status.
 *
 * Returns the normalized domain, or null when the caller is not entitled. Any
 * lookup error fails closed.
 */
export async function requireRegisteredByUs(userId: string, rawDomain: string): Promise<string | null> {
  const domain = rawDomain.trim().toLowerCase()
  if (!domain) return null

  const mine = await listDomainsForUser(userId)
  const row = mine.find((d) => d.domain === domain)
  if (!row || row.source !== 'registrar') return null

  const admin = createAdminClient()
  const { data: link, error: linkError } = await admin
    .from('custom_domains')
    .select('order_id')
    .eq('id', row.id)
    .eq('user_id', userId)
    .maybeSingle()
  const orderId = (link as { order_id: string | null } | null)?.order_id
  if (linkError || !orderId) return null

  const [orders, transfers] = await Promise.all([
    admin.from('domain_orders').select('id').eq('id', orderId).eq('domain', domain).eq('status', 'active').limit(1),
    admin.from('domain_transfers').select('id').eq('id', orderId).eq('domain', domain).eq('status', 'completed').limit(1),
  ])
  if (orders.error || transfers.error) return null
  return (orders.data?.length ?? 0) + (transfers.data?.length ?? 0) > 0 ? domain : null
}
