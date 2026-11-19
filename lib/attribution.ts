/**
 * First-party campaign attribution, stored for 30 days only after analytics
 * consent. Click IDs are represented as booleans; their values are
 * never retained. Paths omit query strings and fragments.
 */

export const ATTRIBUTION_COOKIE = 'gloval_attribution'
export const ATTRIBUTION_TTL_DAYS = 30
export const ATTRIBUTION_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const
export const ATTRIBUTION_CLICK_KEYS = ['gclid', 'fbclid'] as const
export const ATTRIBUTION_KEYS = [...ATTRIBUTION_UTM_KEYS, ...ATTRIBUTION_CLICK_KEYS] as const

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]
export type Attribution = {
  params: Partial<Record<(typeof ATTRIBUTION_UTM_KEYS)[number], string>> &
    Partial<Record<(typeof ATTRIBUTION_CLICK_KEYS)[number], boolean>>
  landing_path: string | null
  /** Epoch milliseconds of the first capture. */
  captured_at: number
}

/** Limits for captured values, matching the applicable database constraints. */
export const ATTRIBUTION_LIMITS = {
  utm: 200,
  landingPath: 300,
} as const

const TTL_MS = ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000

function cleanValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength)
  return trimmed || null
}

/** Keeps the pathname only: the query string and fragment are cut off, never stored. */
function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const pathOnly = value.split(/[?#]/, 1)[0]
  const v = cleanValue(pathOnly, ATTRIBUTION_LIMITS.landingPath)
  return v && v.startsWith('/') ? v : null
}

function safeEventLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 100 || /@|\d{7,}/u.test(trimmed)) return undefined
  return /^[\p{L}\p{N} ._-]+$/u.test(trimmed) ? trimmed : undefined
}

function safeEventPath(value: unknown): string | undefined {
  const path = cleanPath(value)
  if (!path || path.length > 300 || /@|\d{7,}/u.test(path)) return undefined
  return /^[\p{L}\p{N}/._-]+$/u.test(path) ? path : undefined
}

/** First-touch campaign labels for analytics; invalid or personal-looking values are omitted. */
export function attributionEventParams(attribution: Attribution | null = readAttribution()) {
  return {
    utm_source: safeEventLabel(attribution?.params.utm_source) ?? 'direct',
    utm_medium: safeEventLabel(attribution?.params.utm_medium) ?? 'direct',
    utm_campaign: safeEventLabel(attribution?.params.utm_campaign) ?? 'direct',
  }
}

export function landingViewEventParams(attribution: Attribution | null) {
  return {
    ...attributionEventParams(attribution),
    utm_content: safeEventLabel(attribution?.params.utm_content) ?? 'direct',
    landing_path: safeEventPath(attribution?.landing_path) ?? '/',
  }
}

/** Validates untrusted input (cookie contents or a client payload) into a safe Attribution. */
export function sanitizeAttribution(input: unknown): Attribution | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const rawParams = raw.params && typeof raw.params === 'object' ? (raw.params as Record<string, unknown>) : {}
  const params: Attribution['params'] = {}
  for (const key of ATTRIBUTION_UTM_KEYS) {
    const value = cleanValue(rawParams[key], ATTRIBUTION_LIMITS.utm)
    if (value) params[key] = value
  }
  for (const key of ATTRIBUTION_CLICK_KEYS) {
    const value = rawParams[key]
    if (typeof value === 'boolean') params[key] = value
    else if (typeof value === 'string') params[key] = value.trim().length > 0
  }
  const capturedAt = Number(raw.captured_at)
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return null
  return {
    params,
    landing_path: cleanPath(raw.landing_path),
    captured_at: capturedAt,
  }
}

export function isExpired(attribution: Attribution, now = Date.now()): boolean {
  return now - attribution.captured_at > TTL_MS
}

/** The first captured touch remains fixed until its 30-day cookie expires. */
export function shouldReplaceAttribution(existing: Attribution | null, now = Date.now()): boolean {
  return !existing || isExpired(existing, now)
}

/** Builds a snapshot of the current page view; null outside the browser. */
export function snapshotFromLocation(): Attribution | null {
  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search)
  const params: Attribution['params'] = {}
  for (const key of ATTRIBUTION_UTM_KEYS) {
    const value = cleanValue(search.get(key), ATTRIBUTION_LIMITS.utm)
    if (value) params[key] = value
  }
  params.gclid = search.has('gclid')
  params.fbclid = search.has('fbclid')

  return {
    params,
    landing_path: cleanPath(window.location.pathname),
    captured_at: Date.now(),
  }
}

function parseCookieJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return JSON.parse(decodeURIComponent(value))
  }
}

export function parseAttributionCookie(value: string | null | undefined): Attribution | null {
  if (!value) return null
  try {
    const parsed = sanitizeAttribution(parseCookieJson(value))
    return parsed && !isExpired(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function readAttribution(): Attribution | null {
  if (typeof document === 'undefined') return null
  try {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${ATTRIBUTION_COOKIE}=`))
      ?.slice(ATTRIBUTION_COOKIE.length + 1)
    if (!raw) return null
    const rawAttribution = parseCookieJson(raw) as Record<string, unknown>
    const parsed = sanitizeAttribution(rawAttribution)
    if (!parsed || isExpired(parsed)) return null
    const rawParams = rawAttribution.params as Record<string, unknown> | undefined
    if (ATTRIBUTION_CLICK_KEYS.some((key) => typeof rawParams?.[key] === 'string')) writeAttribution(parsed)
    return parsed
  } catch {
    return null
  }
}

export function writeAttribution(attribution: Attribution): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const safe = sanitizeAttribution(attribution)
  if (!safe) return
  const remainingSeconds = Math.max(0, Math.floor((TTL_MS - (Date.now() - safe.captured_at)) / 1000))
  if (!remainingSeconds) return clearAttribution()
  const value = encodeURIComponent(JSON.stringify(safe))
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  try {
    document.cookie = `${ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${remainingSeconds}; samesite=lax${secure}`
  } catch {
    // Cookie restrictions must not interrupt navigation or account creation.
  }
}

export function clearAttribution(): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${ATTRIBUTION_COOKIE}=; path=/; max-age=0; samesite=lax`
  } catch {
    // Cookie restrictions must not interrupt navigation or account creation.
  }
}
