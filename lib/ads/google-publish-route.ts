import 'server-only'

import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { resolveGoogleAdsAccess, resolveGoogleAdsValidateOnlyTestEnabled } from '@/lib/ads/env'
import { recordGoogleAdsPolicyBlock } from '@/lib/ads/google-ads-audit'
import type { GoogleAdsAccessIdentity } from '@/lib/ads/env'
import {
  googleAdsFeatureEnabled,
  googleAdsJson,
  googleAdsNotFound,
  googleAdsRequestAccess,
  isSameOriginGoogleAdsPost,
} from '@/lib/ads/google-route-utils'

export type GoogleAdsPublishGate = { userId: string; identity: GoogleAdsAccessIdentity } | { response: NextResponse }

export async function requireGoogleAdsPublishRequest(request: Request): Promise<GoogleAdsPublishGate> {
  if (!googleAdsFeatureEnabled()) return { response: googleAdsNotFound() }
  if (request.method !== 'GET' && !isSameOriginGoogleAdsPost(request)) {
    return { response: googleAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  }

  let access: Awaited<ReturnType<typeof googleAdsRequestAccess>>
  try {
    access = await googleAdsRequestAccess()
  } catch {
    return { response: googleAdsJson({ ok: false, error: 'auth_unavailable' }, 503) }
  }
  if (!access) return { response: googleAdsJson({ ok: false, error: 'not_authenticated' }, 401) }
  if (!access.decision.canPublish) {
    await recordGoogleAdsPolicyBlock({ userId: access.userId, reason: 'publish_disabled', operation: 'publish_access' })
    return { response: googleAdsNotFound() }
  }

  const limit = checkRateLimit(`google-ads-publish:${access.userId}`, 30, 60_000)
  if (!limit.allowed) return { response: googleAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  return { userId: access.userId, identity: access.identity }
}

export function publishGateResponse(gate: GoogleAdsPublishGate): gate is { response: NextResponse } {
  return 'response' in gate
}

export async function requireGoogleAdsValidateOnlyTestRequest(request: Request): Promise<GoogleAdsPublishGate> {
  if (!googleAdsFeatureEnabled() || !resolveGoogleAdsValidateOnlyTestEnabled()) {
    return { response: googleAdsNotFound() }
  }
  if (request.method !== 'POST' || !isSameOriginGoogleAdsPost(request)) {
    return { response: googleAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  }

  let admin: Awaited<ReturnType<typeof getAdminUser>>
  try {
    admin = await getAdminUser()
  } catch {
    return { response: googleAdsJson({ ok: false, error: 'auth_unavailable' }, 503) }
  }
  const identity: GoogleAdsAccessIdentity = { emailConfirmed: true, isAdmin: true }
  if (!admin || !resolveGoogleAdsAccess(admin.userId, identity).canConnect) {
    return { response: googleAdsNotFound() }
  }

  const limit = checkRateLimit(`google-ads-validate-only-test:${admin.userId}`, 5, 60_000)
  if (!limit.allowed) return { response: googleAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  return { userId: admin.userId, identity }
}
