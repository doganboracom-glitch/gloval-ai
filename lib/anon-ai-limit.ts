import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-only gate for ANONYMOUS (signed-out) AI actions.
 *
 * Scope: `/api/generate` is the only AI endpoint reachable without a session
 * (every other AI route — edit, hero/section/logo image, try-on — returns 401
 * for signed-out callers). Only a generation that actually completed with the
 * model counts; reads, saves and fallback results do not.
 *
 * Identity: a random id in a signed, httpOnly cookie. No personal data is
 * stored. IP is NEVER used as the identity; it is only HMAC-hashed (keyed with
 * a server secret) into a coarse, much higher backstop bucket so that clearing
 * cookies is not an unlimited bypass. Raw IPs are not persisted.
 *
 * Atomicity: counters live in `anon_ai_usage` and are reserved through the
 * `reserve_anon_ai_action` Postgres function (service-role only, serialized per
 * subject with an advisory lock). The slot is reserved BEFORE the model runs
 * (so concurrent requests cannot overshoot) and released if the run fails.
 *
 * Signed-in users are untouched: their 7 actions / 24h FREE rule lives in
 * `lib/free-daily-limit.ts` and is never merged with this counter.
 */
export const ANON_AI_ACTION_LIMIT = 4
const ANON_IP_BACKSTOP_LIMIT = 30
export const ANON_AI_LIMIT_ERROR = 'ANON_AI_LIMIT_REACHED'

const COOKIE_NAME = 'gloval_anon'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function secret(): string {
  const value = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SECRET_KEY
  if (!value) throw new Error('anon limit secret missing')
  return value
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

function verifyCookie(raw: string | undefined): string | null {
  if (!raw) return null
  const [id, sig] = raw.split('.')
  if (!id || !sig) return null
  const expected = Buffer.from(sign(id))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return id
}

function hashedIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || req.headers.get('x-real-ip') || 'unknown'
  return createHmac('sha256', secret()).update(`ip:${ip}`).digest('base64url').slice(0, 32)
}

export type AnonReservation =
  | { allowed: true; subjects: string[] }
  | { allowed: false; limit: number; resetAt: string }

async function reserve(subject: string, limit: number) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .rpc('reserve_anon_ai_action', { p_subject: subject, p_limit: limit })
    .maybeSingle()
  if (error || !data) {
    console.error('[anon-ai-limit] reserve failed:', error?.message)
    return null
  }
  return data as { allowed: boolean; action_count: number; reset_at: string }
}

export async function releaseAnonAiActions(subjects: string[]): Promise<void> {
  const admin = createAdminClient()
  await Promise.all(
    subjects.map((subject) =>
      admin.rpc('release_anon_ai_action', { p_subject: subject }).then(({ error }) => {
        if (error) console.error('[anon-ai-limit] release failed:', error.message)
      }),
    ),
  )
}

/** Reserves one anonymous AI action for this caller (cookie id + IP backstop). */
export async function reserveAnonAiAction(req: Request): Promise<AnonReservation> {
  const jar = await cookies()
  let id = verifyCookie(jar.get(COOKIE_NAME)?.value)
  if (!id) {
    id = randomBytes(16).toString('base64url')
    jar.set(COOKIE_NAME, `${id}.${sign(id)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    })
  }

  const attempts: Array<{ subject: string; limit: number }> = [
    { subject: `anon:${id}`, limit: ANON_AI_ACTION_LIMIT },
    { subject: `ip:${hashedIp(req)}`, limit: ANON_IP_BACKSTOP_LIMIT },
  ]

  const reserved: string[] = []
  for (const { subject, limit } of attempts) {
    const row = await reserve(subject, limit)
    // Fail closed if the counter is unreachable.
    if (!row || !row.allowed) {
      await releaseAnonAiActions(reserved)
      return {
        allowed: false,
        limit: ANON_AI_ACTION_LIMIT,
        resetAt: row?.reset_at ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }
    }
    reserved.push(subject)
  }
  return { allowed: true, subjects: reserved }
}
