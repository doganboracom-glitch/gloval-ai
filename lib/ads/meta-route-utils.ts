import 'server-only'

import { NextResponse } from 'next/server'
import { AuthUnavailableError, getRequestUser } from '@/lib/supabase/request-user'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { resolveMetaAdsAccess, resolveMetaAdsKillSwitch } from '@/lib/ads/env'
import type { GoogleAdsAccessIdentity, MetaAdsAccessDecision } from '@/lib/ads/env'
import { metaAdsErrorCode, metaAdsHttpStatus } from '@/lib/ads/meta-ads-error'
import { dsaBlockedCountries, dsaCountriesMessage } from '@/lib/ads/meta-countries'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie',
}

export function metaAdsFeatureEnabled(): boolean {
  return isAdsFeatureUiEnabled()
}

export function metaAdsKillSwitchActive(): boolean {
  return resolveMetaAdsKillSwitch()
}

export type MetaAdsRequestAccess = {
  userId: string
  identity: GoogleAdsAccessIdentity
  decision: MetaAdsAccessDecision
}

export async function metaAdsRequestAccess(): Promise<MetaAdsRequestAccess | null> {
  const authState = await getRequestUser()
  if (authState.kind === 'unavailable') throw new AuthUnavailableError()
  if (authState.kind !== 'authenticated') return null

  const identity: GoogleAdsAccessIdentity = {
    emailConfirmed: Boolean(authState.user.email_confirmed_at),
    isAdmin: isAdminEmail(authState.user.email),
  }
  return {
    userId: authState.user.id,
    identity,
    decision: resolveMetaAdsAccess(authState.user.id, identity),
  }
}

export function isSameOriginMetaAdsPost(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function metaAdsJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

/** 422 response when the plan targets EU/EEA countries (DSA details are not collected yet); null when it does not. */
export function metaDsaBlockedResponse(countries: readonly string[]): NextResponse | null {
  const message = dsaCountriesMessage(countries)
  if (!message) return null
  return metaAdsJson({
    ok: false,
    error: 'dsa_info_required',
    fieldErrors: { countries: message },
    blockedCountries: dsaBlockedCountries(countries),
  }, metaAdsHttpStatus('dsa_info_required'))
}

export function metaAdsErrorResponse(error: unknown): NextResponse {
  const code = metaAdsErrorCode(error)
  return metaAdsJson({ ok: false, error: code }, metaAdsHttpStatus(code))
}

/**
 * Builds the dashboard URL every Meta OAuth outcome lands on. `platform=meta` opens the Meta tab and
 * `#settings` the account panel; the explicit fragment also stops Facebook from appending `#_=_`.
 */
export function buildMetaDashboardPath(values: Record<string, string>): string {
  const params = new URLSearchParams({ platform: 'meta' })
  for (const [key, value] of Object.entries(values)) params.set(key, value)
  return `/ads/dashboard?${params.toString()}#settings`
}

export function metaAdsRedirect(request: Request, values: Record<string, string>): NextResponse {
  const url = new URL(buildMetaDashboardPath(values), request.url)
  const response = NextResponse.redirect(url, 303)
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value)
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export const META_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
