import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/** One `ads_usage_events` row. It never carries prompts, page text or model output. */
export type AdsUsageRow = {
  user_id: string | null
  anon_subject_hash: string | null
  flow: 'scan' | 'plan' | 'preview'
  model: string
  input_tokens: number | null
  output_tokens: number | null
  est_cost_micro_usd: number | null
  credits_charged: number
  free_quota_used: boolean
  outcome: 'ok' | 'error' | 'refunded'
  error_code: string | null
  duration_ms: number | null
  request_id: string
}

export type AdsUsageSink = (row: AdsUsageRow) => Promise<void>

const UNIQUE_VIOLATION = '23505'

/**
 * Writes one metering row with the service role. Idempotent per
 * (request_id, flow): a repeat hits the unique index and is ignored. A write
 * failure is logged and never fails the request.
 */
export const writeAdsUsageEvent: AdsUsageSink = async (row) => {
  try {
    const { error } = await createAdminClient().from('ads_usage_events').insert(row)
    if (error && (error as { code?: string }).code !== UNIQUE_VIOLATION) {
      console.error('[ads-usage] write failed:', error.message)
    }
  } catch (error) {
    console.error('[ads-usage] write failed:', error instanceof Error ? error.message : 'unknown')
  }
}
