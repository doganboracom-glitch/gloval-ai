/**
 * First-party campaign attribution (UTM + ad click IDs), stored for 30 days in
 * a cookie and only while the visitor has accepted analytics or marketing
 * cookies. Data minimisation: just the seven campaign keys, the first landing
 * path (no query string) and the referrer's hostname.
 */

export const ATTRIBUTION_COOKIE = 'gloval_attribution'
export const ATTRIBUTION_TTL_DAYS = 30
export const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number]

export type Attribution = {
  params: Partial<Record<AttributionKey, string>>
  landing_path: string | null
  referrer_domain: string | null
  /** Epoch milliseconds of the first capture. */
  captured_at: number
}

const MAX_VALUE_LENGTH = 200
const TTL_MS = ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000

function cleanValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_VALUE_LENGTH)
  return trimmed || null
}

function cleanHostname(value: unknown): string | null {
  const v = cleanValue(value)?.toLowerCase()
  return v && /^[a-z0-9.-]{1,100}$/.test(v) ? v : null
}

function cleanPath(value: unknown): string | null {
  const v = cleanValue(value)
  return v && v.startsWith('/') && !v.includes('?') && !v.includes('#') ? v : null
}

/** Validates untrusted input (cookie contents or a client payload) into a safe Attribution. */
export function sanitizeAttribution(input: unknown): Attribution | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const rawParams = raw.params && typeof raw.params === 'object' ? (raw.params as Record<string, unknown>) : {}
  const params: Attribution['params'] = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanValue(rawParams[key])
    if (value) params[key] = value
  }
  const capturedAt = Number(raw.captured_at)
  if (!Number.isFinite(capturedAt) || capturedAt <= 0) return null
  return {
    params,
    landing_path: cleanPath(raw.landing_path),
    referrer_domain: cleanHostname(raw.referrer_domain),
    captured_at: capturedAt,
  }
}

export function isExpired(attribution: Attribution, now = Date.now()): boolean {
  return now - attribution.captured_at > TTL_MS
}

export function hasCampaignParams(attribution: Attribution): boolean {
  return Object.keys(attribution.params).length > 0
}

/**
 * First touch wins inside the 30-day window. The only upgrade allowed is an
 * organic first visit (no campaign keys) being replaced by a campaign visit.
 */
export function shouldReplaceAttribution(existing: Attribution | null, incoming: Attribution, now = Date.now()): boolean {
  if (!existing || isExpired(existing, now)) return true
  return !hasCampaignParams(existing) && hasCampaignParams(incoming)
}

/** Builds a snapshot of the current page view; null outside the browser. */
export function snapshotFromLocation(): Attribution | null {
  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search)
  const params: Attribution['params'] = {}
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanValue(search.get(key))
    if (value) params[key] = value
  }

  let referrerDomain: string | null = null
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname
      if (host && host !== window.location.hostname) referrerDomain = cleanHostname(host)
    }
  } catch {
    referrerDomain = null
  }

  return {
    params,
    landing_path: cleanPath(window.location.pathname),
    referrer_domain: referrerDomain,
    captured_at: Date.now(),
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
    const parsed = sanitizeAttribution(JSON.parse(decodeURIComponent(raw)))
    if (!parsed || isExpired(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeAttribution(attribution: Attribution): void {
  const value = encodeURIComponent(JSON.stringify(attribution))
  const secure = window.location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${ATTRIBUTION_TTL_DAYS * 24 * 60 * 60}; samesite=lax${secure}`
}

export function clearAttribution(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${ATTRIBUTION_COOKIE}=; path=/; max-age=0; samesite=lax`
}
