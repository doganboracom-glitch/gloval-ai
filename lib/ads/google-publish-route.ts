import 'server-only'

import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveGoogleAdsPublishAccess } from '@/lib/ads/env'
import {
  googleAdsConnectAllowed,
  googleAdsFeatureEnabled,
  googleAdsJson,
  googleAdsNotFound,
  googleAdsUserId,
  isSameOriginGoogleAdsPost,
} from '@/lib/ads/google-route-utils'

export type GoogleAdsPublishGate = { userId: string } | { response: NextResponse }

export async function requireGoogleAdsPublishRequest(request: Request): Promise<GoogleAdsPublishGate> {
  if (!googleAdsFeatureEnabled()) return { response: googleAdsNotFound() }
  if (request.method !== 'GET' && !isSameOriginGoogleAdsPost(request)) {
    return { response: googleAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  }

  let userId: string | null
  try {
    userId = await googleAdsUserId()
  } catch {
    return { response: googleAdsJson({ ok: false, error: 'auth_unavailable' }, 503) }
  }
  if (!userId) return { response: googleAdsJson({ ok: false, error: 'not_authenticated' }, 401) }
  if (!googleAdsConnectAllowed(userId) || !resolveGoogleAdsPublishAccess(userId)) {
    return { response: googleAdsNotFound() }
  }

  const limit = checkRateLimit(`google-ads-publish:${userId}`, 30, 60_000)
  if (!limit.allowed) return { response: googleAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  return { userId }
}

export function publishGateResponse(gate: GoogleAdsPublishGate): gate is { response: NextResponse } {
  return 'response' in gate
}
