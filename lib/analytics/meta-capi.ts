import { createHash } from 'node:crypto'
import { after } from 'next/server'
import { isValidPixelId } from '@/lib/analytics-events'
import { isMeasurementSurface } from '@/lib/analytics-config'

/**
 * Server-side Meta Conversions API (CAPI) sender.
 *
 * Guarantees:
 *   - Off unless `META_CAPI_ENABLED=1`, a server-only `META_CAPI_ACCESS_TOKEN`
 *     and a valid `NEXT_PUBLIC_META_PIXEL_ID` exist.
 *   - Nothing leaves the server without the visitor's MARKETING consent
 *     (read from the consent cookie by the caller, see `meta-capi-context.ts`).
 *   - The token travels only in the `Authorization` header; it is never part of
 *     the URL, a log line or an error detail.
 *   - Raw e-mail / phone are never sent or logged: they are normalised and
 *     SHA-256 hashed first.
 *   - Short timeout; the function never throws and never rejects, so it cannot
 *     break or slow the user's flow.
 *   - Idempotent: `event_id` is deterministic (see `event-ids.ts`) and equals
 *     the browser Pixel's `eventID`, so Meta de-duplicates both channels.
 *     Nothing is stored; a small in-process guard only skips obvious repeats.
 */

export const META_CAPI_GRAPH_VERSION = 'v24.0'
export const META_CAPI_TIMEOUT_MS = 5000

export type MetaCapiEventName =
  | 'CompleteRegistration'
  | 'GenerateSiteCompleted'
  | 'PublishSite'
  | 'InitiateCheckout'
  | 'Purchase'

export type MetaCapiContext = {
  /** True only when the visitor's consent cookie grants the marketing category. */
  marketingConsent: boolean
  ip?: string
  userAgent?: string
  fbp?: string
  fbc?: string
  /** Page the event happened on; must be a measured platform surface. */
  sourceUrl?: string
}

export type MetaCapiUser = {
  email?: string | null
  phone?: string | null
  userId?: string | null
}

export type MetaCapiCustomData = {
  value?: number
  currency?: string
  content_name?: string
  content_category?: string
  content_type?: string
  status?: boolean
}

export type MetaCapiEvent = {
  name: MetaCapiEventName
  eventId: string
  context: MetaCapiContext
  user?: MetaCapiUser
  custom?: MetaCapiCustomData
  /** Unix seconds; defaults to now. */
  eventTime?: number
}

export type MetaCapiSkipReason =
  | 'disabled'
  | 'no_token'
  | 'no_pixel'
  | 'no_consent'
  | 'bad_event'
  | 'bad_source_url'
  | 'no_user_data'
  | 'duplicate'

export type MetaCapiResult =
  | { sent: true }
  | { sent: false; reason: MetaCapiSkipReason | 'http_error' | 'network_error' | 'timeout' }

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Meta rule: trim and lowercase. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase()
  return value && value.includes('@') ? value : null
}

/**
 * Meta rule: digits only, with the country code. Turkish national formats
 * (`05xx...`, `5xx...`) are completed with `90` so they match Meta's records.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('05')) digits = `90${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export function buildUserData(context: MetaCapiContext, user?: MetaCapiUser): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  const email = normalizeEmail(user?.email)
  const phone = normalizePhone(user?.phone)
  const userId = user?.userId?.trim()
  if (email) data.em = [sha256Hex(email)]
  if (phone) data.ph = [sha256Hex(phone)]
  if (userId) data.external_id = [sha256Hex(userId)]
  // IP / user agent / click ids are only ever read once marketing consent exists.
  if (context.ip) data.client_ip_address = context.ip
  if (context.userAgent) data.client_user_agent = context.userAgent
  if (context.fbp) data.fbp = context.fbp
  if (context.fbc) data.fbc = context.fbc
  return data
}

function isValidSourceUrl(raw: string | undefined): raw is string {
  if (!raw) return false
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    return isMeasurementSurface(url.hostname, url.pathname)
  } catch {
    return false
  }
}

const RECENT_LIMIT = 500
const recentlySent = new Set<string>()

function remember(key: string) {
  recentlySent.add(key)
  if (recentlySent.size > RECENT_LIMIT) {
    const oldest = recentlySent.values().next().value
    if (oldest !== undefined) recentlySent.delete(oldest)
  }
}

/** Test helper: clears the in-process duplicate guard. */
export function resetMetaCapiState() {
  recentlySent.clear()
}

type SendDeps = { fetch?: typeof fetch; now?: () => number }

/**
 * Sends one event. Never throws. Returns why nothing was sent so callers and
 * tests can tell a skip from a failure.
 */
export async function sendMetaCapiEvent(event: MetaCapiEvent, deps: SendDeps = {}): Promise<MetaCapiResult> {
  try {
    if (process.env.META_CAPI_ENABLED !== '1') return { sent: false, reason: 'disabled' }
    const token = process.env.META_CAPI_ACCESS_TOKEN?.trim()
    if (!token) return { sent: false, reason: 'no_token' }
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim()
    if (!isValidPixelId(pixelId)) return { sent: false, reason: 'no_pixel' }
    if (event.context.marketingConsent !== true) return { sent: false, reason: 'no_consent' }
    if (!event.eventId || event.eventId.length > 128 || !event.name) return { sent: false, reason: 'bad_event' }
    if (!isValidSourceUrl(event.context.sourceUrl)) return { sent: false, reason: 'bad_source_url' }

    const userData = buildUserData(event.context, event.user)
    if (Object.keys(userData).length === 0) return { sent: false, reason: 'no_user_data' }

    const dedupeKey = `${event.name}:${event.eventId}`
    if (recentlySent.has(dedupeKey)) return { sent: false, reason: 'duplicate' }

    const now = deps.now ?? Date.now
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: event.name,
          event_time: event.eventTime ?? Math.floor(now() / 1000),
          event_id: event.eventId,
          event_source_url: event.context.sourceUrl,
          action_source: 'website',
          user_data: userData,
          ...(event.custom && Object.keys(event.custom).length > 0 ? { custom_data: event.custom } : {}),
        },
      ],
    }
    const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim()
    if (testEventCode) body.test_event_code = testEventCode

    const doFetch = deps.fetch ?? fetch
    let response: Response
    try {
      response = await doFetch(`https://graph.facebook.com/${META_CAPI_GRAPH_VERSION}/${pixelId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(META_CAPI_TIMEOUT_MS),
        cache: 'no-store',
      })
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      // Only the error class is logged: messages could echo request details.
      console.log('[meta-capi] request failed', { event: event.name, kind: timedOut ? 'timeout' : 'network' })
      return { sent: false, reason: timedOut ? 'timeout' : 'network_error' }
    }

    if (!response.ok) {
      console.log('[meta-capi] rejected', { event: event.name, status: response.status })
      return { sent: false, reason: 'http_error' }
    }

    remember(dedupeKey)
    return { sent: true }
  } catch {
    console.log('[meta-capi] unexpected failure', { event: event.name })
    return { sent: false, reason: 'network_error' }
  }
}

/**
 * Runs the work after the response has been sent (so the user never waits for
 * Meta), falling back to a detached promise outside a request scope.
 */
export function runInBackground(work: () => Promise<unknown>): void {
  const safe = () => work().catch(() => undefined)
  try {
    after(safe)
  } catch {
    void safe()
  }
}

/** Fire-and-forget convenience wrapper around `sendMetaCapiEvent`. */
export function dispatchMetaCapiEvent(event: MetaCapiEvent): void {
  runInBackground(() => sendMetaCapiEvent(event))
}
