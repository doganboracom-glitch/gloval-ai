import { ADS_SCAN_ERROR_STATUS, type AdsScanError, type AdsScanErrorCode } from '@/lib/ads/public-errors'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

export const ADS_SCAN_PATH = '/api/ads/scan'
export const ADS_SESSION_PATH = '/api/ads/session'

/** The server refuses a cookie younger than this, so a retry right after issuing it would fail again. */
const COOKIE_SETTLE_MS = 2100

export type ClientScanError =
  | AdsScanError
  | { code: 'network' }
  /** A retry after a lost response found the request already processed: the result is unknown. */
  | { code: 'duplicate_lost' }

export type ClientScanOutcome = { ok: true; result: PublicScanResult } | { ok: false; error: ClientScanError }

export type ScanClientDeps = {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const KNOWN_CODES = new Set<string>(Object.keys(ADS_SCAN_ERROR_STATUS))

function isScanResult(value: unknown): value is PublicScanResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.host === 'string' &&
    !!v.plan &&
    typeof v.plan === 'object' &&
    !!v.ad &&
    typeof v.ad === 'object' &&
    !!v.budget &&
    typeof v.budget === 'object' &&
    Array.isArray(v.restricted)
  )
}

async function parse(response: Response): Promise<ClientScanOutcome> {
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: { code: 'service_unavailable' } }
  }
  const body = (json ?? {}) as { result?: unknown; error?: Record<string, unknown> }
  if (response.ok && isScanResult(body.result)) return { ok: true, result: body.result }

  const code = body.error?.code
  if (typeof code !== 'string' || !KNOWN_CODES.has(code)) {
    return { ok: false, error: { code: 'service_unavailable' } }
  }
  const error: AdsScanError = { code: code as AdsScanErrorCode }
  if (typeof body.error?.balance === 'number') error.balance = body.error.balance
  if (typeof body.error?.consumed === 'boolean') error.consumed = body.error.consumed
  if (typeof body.error?.retryAfterSeconds === 'number') error.retryAfterSeconds = body.error.retryAfterSeconds
  return { ok: false, error }
}

/**
 * Sends one scan with a single requestId. A missing cookie (428) is fixed once
 * by calling the session route; a lost response is retried once with the same
 * requestId, and a 409 on that retry means the first attempt ran.
 */
export async function requestScan(
  input: { address: string; requestId: string },
  deps: ScanClientDeps = {},
): Promise<ClientScanOutcome> {
  const doFetch = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  const post = async () =>
    parse(
      await doFetch(ADS_SCAN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ address: input.address, requestId: input.requestId }),
      }),
    )

  let sessionFixed = false
  let networkRetried = false
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const outcome = await post()
      if (!outcome.ok && outcome.error.code === 'session_required' && !sessionFixed) {
        sessionFixed = true
        try {
          await doFetch(ADS_SESSION_PATH, { credentials: 'same-origin', cache: 'no-store' })
        } catch {
          return { ok: false, error: { code: 'network' } }
        }
        await sleep(COOKIE_SETTLE_MS)
        continue
      }
      if (!outcome.ok && outcome.error.code === 'duplicate' && networkRetried) {
        return { ok: false, error: { code: 'duplicate_lost' } }
      }
      return outcome
    } catch {
      if (networkRetried) return { ok: false, error: { code: 'network' } }
      networkRetried = true
    }
  }
  return { ok: false, error: { code: 'network' } }
}

export type ScanStage = 'reading' | 'planning' | 'writing' | 'slow'

/** Which progress label to show for the seconds elapsed since the request started. */
export function scanStageFor(elapsedSeconds: number): ScanStage {
  if (elapsedSeconds < 8) return 'reading'
  if (elapsedSeconds < 35) return 'planning'
  if (elapsedSeconds < 90) return 'writing'
  return 'slow'
}
