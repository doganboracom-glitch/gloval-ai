import 'server-only'

import { checkRateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { missingMetaPublishScopes } from '@/lib/ads/meta-ads-shared'
import type { MetaConnectionRow } from '@/lib/ads/meta-connections'
import {
  isSameOriginMetaAdsPost,
  metaAdsFeatureEnabled,
  metaAdsJson,
  metaAdsKillSwitchActive,
  metaAdsRequestAccess,
  META_UUID_PATTERN,
  type MetaAdsRequestAccess,
} from '@/lib/ads/meta-route-utils'
import type { NextResponse } from 'next/server'

type Guard = { ok: true; access: MetaAdsRequestAccess; admin: ReturnType<typeof createAdminClient> } | { ok: false; response: NextResponse }

/** Every Meta publish route: feature flag, same-origin, signed-in, publish allowlist, kill switch, rate limit. */
export async function guardMetaPublishRoute(request: Request, rate: { key: string; limit: number }): Promise<Guard> {
  if (!metaAdsFeatureEnabled()) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (request.method !== 'GET' && !isSameOriginMetaAdsPost(request)) {
    return { ok: false, response: metaAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  }
  const access = await metaAdsRequestAccess()
  if (!access) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_authenticated' }, 401) }
  if (!access.decision.canConnect) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (!access.decision.canPublish) return { ok: false, response: metaAdsJson({ ok: false, error: 'publish_not_allowed' }, 403) }
  if (metaAdsKillSwitchActive()) return { ok: false, response: metaAdsJson({ ok: false, error: 'kill_switch_active' }, 503) }
  if (!checkRateLimit(`${rate.key}:${access.userId}`, rate.limit, 60_000).allowed) {
    return { ok: false, response: metaAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  }
  return { ok: true, access, admin: createAdminClient() }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && META_UUID_PATTERN.test(value)
}

/** Publishing needs a healthy connection with write permission and a Facebook Page. */
export function assertMetaPublishable(connection: MetaConnectionRow): void {
  if (connection.status !== 'active') throw new MetaAdsError('reauth_required')
  if (missingMetaPublishScopes(connection.scopes ?? []).length > 0) throw new MetaAdsError('publish_permission_missing')
  if (!connection.page_id) throw new MetaAdsError('page_required')
}
