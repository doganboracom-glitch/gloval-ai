import type { SupabaseClient } from '@supabase/supabase-js'

export const SIGNUP_ATTRIBUTION_RETENTION_MONTHS = 24

/**
 * Deletes attribution rows older than the retention window; called by the daily
 * cron. Lives outside `signup-attribution.ts` on purpose: that file is a
 * 'use server' module, so every export there is a client-callable action.
 */
export async function sweepOldSignupAttribution(admin: SupabaseClient, nowMs: number): Promise<number> {
  const cutoff = new Date(nowMs)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SIGNUP_ATTRIBUTION_RETENTION_MONTHS)
  const { data, error } = await admin
    .from('signup_attribution')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('user_id')
  if (error) throw error
  return data?.length ?? 0
}
