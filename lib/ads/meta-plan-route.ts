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

type Decision = MetaAdsRequestAccess['decision']

async function guardMetaRoute(
  request: Request,
  rate: { key: string; limit: number },
  permitted: (decision: Decision) => boolean,
): Promise<Guard> {
  if (!metaAdsFeatureEnabled()) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (request.method !== 'GET' && !isSameOriginMetaAdsPost(request)) {
    return { ok: false, response: metaAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  }
  const access = await metaAdsRequestAccess()
  if (!access) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_authenticated' }, 401) }
  if (!access.decision.canConnect) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (!permitted(access.decision)) return { ok: false, response: metaAdsJson({ ok: false, error: 'publish_not_allowed' }, 403) }
  if (metaAdsKillSwitchActive()) return { ok: false, response: metaAdsJson({ ok: false, error: 'kill_switch_active' }, 503) }
  if (!checkRateLimit(`${rate.key}:${access.userId}`, rate.limit, 60_000).allowed) {
    return { ok: false, response: metaAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  }
  return { ok: true, access, admin: createAdminClient() }
}

/** Every Meta publish route: feature flag, same-origin, signed-in, publish allowlist, kill switch, rate limit. */
export function guardMetaPublishRoute(request: Request, rate: { key: string; limit: number }): Promise<Guard> {
  return guardMetaRoute(request, rate, (decision) => decision.canPublish)
}

/**
 * Status read / sync routes: read-only toward Meta, so publish, manage or protective-manage permission is enough.
 * Connect access, the kill switch and the rate limit still apply; a user with none of the permissions gets 403.
 */
export function guardMetaSyncRoute(request: Request, rate: { key: string; limit: number }): Promise<Guard> {
  return guardMetaRoute(request, rate, (decision) => decision.canPublish || decision.canManage || decision.canManageProtective)
}

/**
 * Manage routes (activate / pause / budget). Needs at least the protective permission; the stricter `canManage`
 * (money-increasing actions) is checked per action by the route. The Meta kill switch stops every Graph call.
 */
export async function guardMetaManageRoute(request: Request, rate: { key: string; limit: number }): Promise<Guard> {
  if (!metaAdsFeatureEnabled()) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (!isSameOriginMetaAdsPost(request)) return { ok: false, response: metaAdsJson({ ok: false, error: 'csrf_failed' }, 403) }
  const access = await metaAdsRequestAccess()
  if (!access) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_authenticated' }, 401) }
  if (!access.decision.canConnect) return { ok: false, response: metaAdsJson({ ok: false, error: 'not_found' }, 404) }
  if (!access.decision.canManageProtective) return { ok: false, response: metaAdsJson({ ok: false, error: 'manage_not_allowed' }, 403) }
  if (metaAdsKillSwitchActive()) return { ok: false, response: metaAdsJson({ ok: false, error: 'kill_switch_active' }, 503) }
  if (!checkRateLimit(`${rate.key}:${access.userId}`, rate.limit, 60_000).allowed) {
    return { ok: false, response: metaAdsJson({ ok: false, error: 'rate_limited' }, 429) }
  }
  return { ok: true, access, admin: createAdminClient() }
}

/** Managing needs an active connection that holds ads_management; a Page is not required. */
export function assertMetaManageable(connection: MetaConnectionRow): void {
  if (connection.status !== 'active') throw new MetaAdsError('reauth_required')
  if (!(connection.scopes ?? []).includes('ads_management')) throw new MetaAdsError('publish_permission_missing')
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
