import 'server-only'

import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ADS_FREE_LIMITS, assertAdsRequestId } from '@/lib/ads/credit-costs'
import { resolveAnonDailyCap, resolveAnonHashSecret } from '@/lib/ads/env'
import type { AdsRpcClient } from '@/lib/ads/credits'

/**
 * Free scan + preview allowance, signed-in and anonymous. Counters live in
 * `ads_free_usage` and are reserved through `reserve_ads_free_actions`
 * (all-or-nothing across subjects, idempotent per request id, Europe/Istanbul
 * day). Reserve BEFORE the model runs; release if the run fails.
 */

export type AdsFreeSubjects = { subjects: string[]; limits: number[]; anonSubjectHash: string | null }

type Env = Readonly<Record<string, string | undefined>>

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32)
}

/** Subjects for a signed-in user: one counter. */
export function signedInSubjects(userId: string): AdsFreeSubjects {
  return { subjects: [`ads:user:${userId}`], limits: [ADS_FREE_LIMITS.signedInPerDay], anonSubjectHash: null }
}

/**
 * Subjects for an anonymous visitor: cookie id, IP backstop and a global daily
 * ceiling. Cookie id and IP are HMAC-hashed with `ADS_ANON_HASH_SECRET` before
 * they leave the process, and the raw values are never stored. Returns null
 * when the secret is missing, so the caller must refuse the request.
 */
export function anonymousSubjects(
  input: { anonId: string; ip: string },
  env: Env = process.env,
): AdsFreeSubjects | null {
  const secret = resolveAnonHashSecret(env)
  if (!secret) return null
  const cookieHash = hmac(secret, `cookie:${input.anonId}`)
  const ipHash = hmac(secret, `ip:${input.ip}`)
  return {
    subjects: [`ads:anon:${cookieHash}`, `ads:ip:${ipHash}`, 'ads:global:anon'],
    limits: [
      ADS_FREE_LIMITS.anonPerCookiePerDay,
      ADS_FREE_LIMITS.anonPerIpPerDay,
      resolveAnonDailyCap(env),
    ],
    anonSubjectHash: cookieHash,
  }
}

export type AdsFreeReservation =
  | { allowed: true; alreadyReserved: boolean }
  | { allowed: false; reason: 'limit_reached'; blockedSubject: string | null }
  | { allowed: false; reason: 'quota_unavailable'; blockedSubject: null }

export async function reserveAdsFreeActions(
  requestId: string,
  subjects: AdsFreeSubjects,
  client: AdsRpcClient = createAdminClient() as unknown as AdsRpcClient,
): Promise<AdsFreeReservation> {
  assertAdsRequestId(requestId)
  const { data, error } = await client
    .rpc('reserve_ads_free_actions', {
      p_request_id: requestId,
      p_subjects: subjects.subjects,
      p_limits: subjects.limits,
    })
    .maybeSingle()

  // Fail closed: an unreachable counter must not grant free model calls.
  if (error || !data) {
    console.error('[ads-free-quota] reserve failed:', error?.message ?? 'no row')
    return { allowed: false, reason: 'quota_unavailable', blockedSubject: null }
  }
  const row = data as { allowed: boolean; blocked_subject: string | null; already_reserved: boolean }
  if (!row.allowed) {
    return { allowed: false, reason: 'limit_reached', blockedSubject: row.blocked_subject ?? null }
  }
  return { allowed: true, alreadyReserved: Boolean(row.already_reserved) }
}

/** Gives back the free action of a failed request. Idempotent; returns whether anything was released. */
export async function releaseAdsFreeActions(
  requestId: string,
  client: AdsRpcClient = createAdminClient() as unknown as AdsRpcClient,
): Promise<boolean> {
  assertAdsRequestId(requestId)
  const { data, error } = await client
    .rpc('release_ads_free_actions', { p_request_id: requestId })
    .maybeSingle()
  if (error) {
    console.error('[ads-free-quota] release failed:', error.message)
    return false
  }
  return data === true
}
