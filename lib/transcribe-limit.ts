import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateAnonId, hashedIp } from '@/lib/anon-ai-limit'

/**
 * Rate limits for POST /api/transcribe.
 *
 * Counters live in `rate_limit_counters` (see `reserve_rate_limit`), keyed with
 * an `stt:` prefix so they can never collide with the anonymous generation
 * quota in `anon_ai_usage` (4 sites) or the signed-in FREE daily rule.
 * Voice dictation is free of credits; this is purely abuse protection.
 */
interface Bucket {
  subject: string
  limit: number
  windowSeconds: number
}

const MINUTE = 60
const DAY = 24 * 60 * 60

export const TRANSCRIBE_LIMITS = {
  user: { perMinute: 6, perDay: 100 },
  anon: { perMinute: 3, perDay: 15 },
  ip: { perMinute: 4, perDay: 25 },
} as const

export type TranscribeReservation =
  | { allowed: true; subjects: string[] }
  | { allowed: false; retryAfterSeconds: number }

export function bucketsForUser(userId: string): Bucket[] {
  const { perMinute, perDay } = TRANSCRIBE_LIMITS.user
  return [
    { subject: `stt:min:user:${userId}`, limit: perMinute, windowSeconds: MINUTE },
    { subject: `stt:day:user:${userId}`, limit: perDay, windowSeconds: DAY },
  ]
}

export function bucketsForAnon(anonId: string, ipHash: string): Bucket[] {
  const { anon, ip } = TRANSCRIBE_LIMITS
  return [
    { subject: `stt:min:anon:${anonId}`, limit: anon.perMinute, windowSeconds: MINUTE },
    { subject: `stt:day:anon:${anonId}`, limit: anon.perDay, windowSeconds: DAY },
    { subject: `stt:min:ip:${ipHash}`, limit: ip.perMinute, windowSeconds: MINUTE },
    { subject: `stt:day:ip:${ipHash}`, limit: ip.perDay, windowSeconds: DAY },
  ]
}

async function reserveOne(bucket: Bucket) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .rpc('reserve_rate_limit', {
      p_subject: bucket.subject,
      p_limit: bucket.limit,
      p_window_seconds: bucket.windowSeconds,
    })
    .maybeSingle()
  if (error || !data) {
    console.error('[transcribe-limit] reserve failed:', error?.message)
    return null
  }
  return data as { allowed: boolean; hit_count: number; reset_at: string }
}

export async function releaseTranscribeSlots(subjects: string[]): Promise<void> {
  const admin = createAdminClient()
  await Promise.all(
    subjects.map((subject) =>
      admin.rpc('release_rate_limit', { p_subject: subject }).then(({ error }) => {
        if (error) console.error('[transcribe-limit] release failed:', error.message)
      }),
    ),
  )
}

/** Reserves every bucket or none; fails closed when the counter is unreachable. */
export async function reserveBuckets(buckets: Bucket[]): Promise<TranscribeReservation> {
  const reserved: string[] = []
  for (const bucket of buckets) {
    const row = await reserveOne(bucket)
    if (!row || !row.allowed) {
      await releaseTranscribeSlots(reserved)
      const resetMs = row ? new Date(row.reset_at).getTime() - Date.now() : bucket.windowSeconds * 1000
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)),
      }
    }
    reserved.push(bucket.subject)
  }
  return { allowed: true, subjects: reserved }
}

export async function reserveForUser(userId: string) {
  return reserveBuckets(bucketsForUser(userId))
}

export async function reserveForAnon(req: Request) {
  const anonId = await getOrCreateAnonId()
  return reserveBuckets(bucketsForAnon(anonId, hashedIp(req)))
}
