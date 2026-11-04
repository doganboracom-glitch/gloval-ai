'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPAIGN_ID_PATTERN = /^\d{1,20}$/

export type GoogleAdsPublishResolution = 'published' | 'failed_refunded'

export type GoogleAdsPublishResolutionResult =
  | { ok: true; state: GoogleAdsPublishResolution; refunded: boolean }
  | { ok: false; error: string }

export async function resolveStuckGoogleAdsPublish(input: {
  planId: string
  requestId: string
  resolution: GoogleAdsPublishResolution
  campaignId?: string
  confirmed: boolean
}): Promise<GoogleAdsPublishResolutionResult> {
  const actor = await requireAdmin()

  if (process.env.GOOGLE_ADS_PUBLISH_ENABLED !== '1') return { ok: false, error: 'disabled' }
  if (
    !input ||
    !UUID_PATTERN.test(input.planId) ||
    !UUID_PATTERN.test(input.requestId) ||
    (input.resolution !== 'published' && input.resolution !== 'failed_refunded') ||
    input.confirmed !== true
  ) {
    return { ok: false, error: 'invalid_request' }
  }

  const campaignId = input.campaignId?.trim() ?? ''
  if (input.resolution === 'published' && !CAMPAIGN_ID_PATTERN.test(campaignId)) {
    return { ok: false, error: 'invalid_campaign_id' }
  }
  if (input.resolution === 'failed_refunded' && campaignId) {
    return { ok: false, error: 'invalid_request' }
  }

  const admin = createAdminClient() as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => { maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }> }
  }
  const { data, error } = await admin.rpc('ads_resolve_google_ads_publish', {
    p_plan_id: input.planId,
    p_request_id: input.requestId,
    p_resolution: input.resolution,
    p_external_campaign_id: input.resolution === 'published' ? campaignId : null,
    p_admin_email: actor.email,
  }).maybeSingle()

  if (error || !data || typeof data !== 'object') return { ok: false, error: 'resolution_failed' }
  const result = data as { state?: unknown; refunded?: unknown }
  if (result.state !== 'published' && result.state !== 'failed_refunded') {
    return { ok: false, error: typeof result.state === 'string' ? result.state : 'resolution_failed' }
  }

  revalidatePath('/admin/ads-publishing')
  return {
    ok: true,
    state: result.state,
    refunded: result.refunded === true,
  }
}
