import { transcribe } from 'ai'
import { createClient } from '@/lib/supabase/server'
import {
  releaseTranscribeSlots,
  reserveForAnon,
  reserveForUser,
} from '@/lib/transcribe-limit'
import {
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
  isAllowedAudioType,
  looksLikeAudio,
} from '@/lib/voice/audio-limits'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Cheapest Gateway transcription model verified to support Turkish
 * (microsoft/mai-transcribe-2, $0.00002778 per audio second, about $0.10/hour).
 */
const TRANSCRIPTION_MODEL = 'microsoft/mai-transcribe-2'

function json(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Reads the body, aborting as soon as it exceeds the byte ceiling. */
async function readCapped(req: Request): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES) return null
  if (!req.body) return new Uint8Array(0)

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_AUDIO_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/**
 * Voice dictation fallback. The audio is processed in memory only: it is never
 * written to disk or storage and never logged. Free of credits; protected by
 * rate limits (signed-in: 6/min and 100/day; anonymous: tighter, cookie + IP).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ error: 'forbidden' }, 403)

  if (!isAllowedAudioType(req.headers.get('content-type'))) {
    return json({ error: 'unsupported_media_type' }, 415)
  }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id ?? null

  const reservation = userId ? await reserveForUser(userId) : await reserveForAnon(req)
  if (!reservation.allowed) {
    return json({ error: 'rate_limited' }, 429, {
      'Retry-After': String(reservation.retryAfterSeconds),
    })
  }

  const audio = await readCapped(req)
  if (!audio) {
    await releaseTranscribeSlots(reservation.subjects)
    return json({ error: 'too_large' }, 413)
  }
  if (audio.byteLength < MIN_AUDIO_BYTES || !looksLikeAudio(audio)) {
    await releaseTranscribeSlots(reservation.subjects)
    return json({ error: 'invalid_audio' }, 400)
  }

  try {
    const { text } = await transcribe({
      model: TRANSCRIPTION_MODEL,
      audio,
      abortSignal: AbortSignal.timeout(25_000),
      maxRetries: 1,
    })
    return json({ text: text.trim() }, 200)
  } catch (error) {
    await releaseTranscribeSlots(reservation.subjects)
    const name = error instanceof Error ? error.name : 'unknown'
    console.error('[transcribe] model call failed:', name)
    return json({ error: 'transcribe_failed' }, 502)
  }
}
