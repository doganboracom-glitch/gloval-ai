import 'server-only'

import { createHash, createHmac } from 'node:crypto'
import { assertAdsRequestId } from '@/lib/ads/credit-costs'
import type { AdsRpcClient } from '@/lib/ads/credits'
import { resolveAnonHashSecret, resolvePolicyBlockGlobalDailyCap } from '@/lib/ads/env'
import {
  releaseAdsFreeActions,
  reserveAdsFreeActions,
  type AdsFreeReservation,
  type AdsFreeSubjects,
} from '@/lib/ads/free-quota'
import {
  ADS_POLICY_BLOCK_GLOBAL_SUBJECT,
  ADS_POLICY_BLOCK_LIMITS,
  ADS_POLICY_BLOCK_RESERVATION_ID_PREFIX,
} from '@/lib/ads/policy-constants'

type Env = Readonly<Record<string, string | undefined>>

export type AdsPolicyAttemptIdentity =
  | { kind: 'user'; userId: string; ip?: string | null }
  | { kind: 'anon'; anonId: string; ip: string }

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url').slice(0, 32)
}

/** Policy-only counters use separate HMAC subjects; no raw account, cookie, or IP value reaches storage. */
export function adsPolicyBlockSubjects(
  identity: AdsPolicyAttemptIdentity,
  env: Env = process.env,
): AdsFreeSubjects | null {
  const secret = resolveAnonHashSecret(env)
  if (!secret) return null

  const identityKind = identity.kind === 'user' ? 'user' : 'cookie'
  const identityValue = identity.kind === 'user' ? identity.userId : identity.anonId
  const subjects = [`ads:policy:${identityKind}:${hmac(secret, `policy:${identityKind}:${identityValue}`)}`]
  const limits: number[] = [ADS_POLICY_BLOCK_LIMITS.identityPerDay]

  const ip = identity.ip?.trim()
  if (ip) {
    subjects.push(`ads:policy:ip:${hmac(secret, `policy:ip:${ip}`)}`)
    limits.push(ADS_POLICY_BLOCK_LIMITS.ipPerDay)
  }

  subjects.push(ADS_POLICY_BLOCK_GLOBAL_SUBJECT)
  limits.push(resolvePolicyBlockGlobalDailyCap(env))

  return { subjects, limits, anonSubjectHash: null }
}

/** Keeps policy reservations distinct from regular free-scan reservations for the same request. */
export function policyAttemptReservationId(requestId: string): string {
  assertAdsRequestId(requestId)
  const digest = createHash('sha256').update(requestId).digest('hex').slice(0, 40)
  return `${ADS_POLICY_BLOCK_RESERVATION_ID_PREFIX}${digest}`
}

export async function reservePolicyBlockAttempt(
  requestId: string,
  identity: AdsPolicyAttemptIdentity,
  env: Env = process.env,
  client?: AdsRpcClient,
): Promise<AdsFreeReservation> {
  const subjects = adsPolicyBlockSubjects(identity, env)
  if (!subjects) return { allowed: false, reason: 'quota_unavailable', blockedSubject: null }

  const reservationId = policyAttemptReservationId(requestId)
  return client
    ? reserveAdsFreeActions(reservationId, subjects, client)
    : reserveAdsFreeActions(reservationId, subjects)
}

export async function releasePolicyBlockAttempt(requestId: string, client?: AdsRpcClient): Promise<boolean> {
  const reservationId = policyAttemptReservationId(requestId)
  return client ? releaseAdsFreeActions(reservationId, client) : releaseAdsFreeActions(reservationId)
}
