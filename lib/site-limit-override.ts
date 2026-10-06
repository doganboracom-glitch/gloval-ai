import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Per-user publish-limit exception set by an admin (`user_limit_overrides`).
 * Returns the override only while it is unexpired; null means "use the plan's
 * own SITE_LIMITS value". Fails closed to null on any error, so a read problem
 * can never silently raise someone's limit.
 */
export async function getActiveSiteLimitOverride(userId: string): Promise<number | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('user_limit_overrides')
      .select('site_limit, expires_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (!data) return null
    if (data.expires_at && new Date(data.expires_at as string) <= new Date()) return null
    return typeof data.site_limit === 'number' ? data.site_limit : null
  } catch {
    return null
  }
}
