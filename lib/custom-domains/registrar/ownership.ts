import { createAdminClient } from '@/lib/supabase/admin'
import { listDomainsForUser } from '../service'

/**
 * A registrar-side operation is allowed only on a domain this user holds AND that
 * we registered or transferred in for them (an active order or a completed
 * transfer owned by the same user). Externally connected domains and other
 * users' domains never pass, so the provider is never touched for them.
 *
 * Returns the normalized domain, or null when the caller is not entitled.
 */
export async function requireRegisteredByUs(userId: string, rawDomain: string): Promise<string | null> {
  const domain = rawDomain.trim().toLowerCase()
  if (!domain) return null
  const mine = await listDomainsForUser(userId)
  if (!mine.some((d) => d.domain === domain)) return null
  const admin = createAdminClient()
  const [orders, transfers] = await Promise.all([
    admin.from('domain_orders').select('id').eq('user_id', userId).eq('domain', domain).eq('status', 'active').limit(1),
    admin.from('domain_transfers').select('id').eq('user_id', userId).eq('domain', domain).eq('status', 'completed').limit(1),
  ])
  return (orders.data?.length ?? 0) + (transfers.data?.length ?? 0) > 0 ? domain : null
}
