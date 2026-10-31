import type { TrackingCodes, WebsiteSchema } from '@/lib/website-schema'
import type { PlanCode } from '@/lib/pricing-config'

/**
 * Owner-supplied third-party code (analytics, tag manager, pixels, site
 * verification) is stored verbatim on the website schema and injected into the
 * PUBLISHED site only. These helpers keep that injection predictable:
 *
 *  - `<meta name="..." content="...">` tags are lifted out of the head snippet
 *    and returned as Next.js `metadata.other` entries, so verification tags end
 *    up in the real document `<head>` (where Google Search Console looks).
 *  - Everything else (scripts, noscript, links) is injected as raw HTML into the
 *    document exactly as pasted — no escaping, no rewriting — so scripts execute
 *    during the initial page parse.
 */

const META_TAG = /<meta\b[^>]*>/gi

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  if (!match) return null
  return match[2] ?? match[3] ?? null
}

/**
 * Extracts safe `<meta name|property="…" content="…">` pairs from a head
 * snippet for Next.js metadata (`other`). Charset, viewport, robots, description,
 * and generated Open Graph/Twitter fields stay owned by the site's metadata.
 */
export function extractMetaTags(code?: string | null): Record<string, string> {
  if (!code) return {}
  const result: Record<string, string> = {}
  for (const tag of code.match(META_TAG) ?? []) {
    const name = attr(tag, 'name') ?? attr(tag, 'property')
    const content = attr(tag, 'content')
    if (!name || content === null) continue
    const normalizedName = name.trim().toLowerCase()
    if (
      ['viewport', 'charset', 'description', 'robots', 'googlebot'].includes(normalizedName) ||
      normalizedName.startsWith('og:') ||
      normalizedName.startsWith('twitter:')
    ) {
      continue
    }
    result[name] = content
  }
  return result
}

/** The head snippet without its `<meta>` tags (those go through metadata). */
export function stripMetaTags(code?: string | null): string {
  if (!code) return ''
  return code.replace(META_TAG, '').trim()
}

const UNSAFE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['javascript_uri', /javascript\s*:/i],
  ['html_data_uri', /data\s*:\s*text\/html/i],
  ['meta_refresh', /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*(refresh|set-cookie|content-security-policy)/i],
  ['base_tag', /<\s*base\b/i],
  ['form_tag', /<\s*form\b/i],
  ['object_embed', /<\s*(object|embed)\b/i],
  ['canonical_link', /<\s*link\b[^>]*rel\s*=\s*["']?\s*canonical/i],
  ['insecure_script', /<\s*script\b[^>]*\bsrc\s*=\s*["']?\s*http:\/\//i],
]

/**
 * Names of the harmful patterns found in an owner snippet. Analytics, tag
 * manager, pixel and verification snippets never need any of these; they
 * redirect visitors, hijack relative URLs, spoof the canonical or phish.
 */
export function findUnsafeTrackingPatterns(code?: string | null): string[] {
  if (!code) return []
  return UNSAFE_PATTERNS.filter(([, pattern]) => pattern.test(code)).map(([name]) => name)
}

export function isUnsafeTrackingCode(code?: string | null): boolean {
  return findUnsafeTrackingPatterns(code).length > 0
}

/** `code` itself when clean, otherwise an empty string (the snippet is rejected whole). */
export function safeTrackingCode(code?: string | null): string {
  return !code || isUnsafeTrackingCode(code) ? '' : code
}

/** The tracking object without any rejected snippet; `undefined` when nothing is left. */
export function sanitizeTracking(tracking: TrackingCodes | undefined): TrackingCodes | undefined {
  if (!tracking) return tracking
  const clean: TrackingCodes = {}
  for (const field of ['head', 'bodyStart', 'bodyEnd'] as const) {
    const value = tracking[field]
    if (value !== undefined && !isUnsafeTrackingCode(value)) clean[field] = value
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/** True when a snippet has anything worth injecting. */
export function hasCode(code?: string | null): boolean {
  return Boolean(code && code.trim().length > 0)
}

/** Custom head/body code (analytics, Search Console verification) is open on STARTER and above. */
export function canUseTrackingCode(plan: PlanCode): boolean {
  return plan !== 'free'
}

/**
 * Server-side authority for the plan gate. A plan without the feature can never
 * change `tracking`: whatever it submitted is ignored and the stored value kept.
 */
export function enforceTrackingPlan(
  next: WebsiteSchema,
  stored: Pick<WebsiteSchema, 'tracking'> | null | undefined,
  plan: PlanCode,
): WebsiteSchema {
  if (canUseTrackingCode(plan)) return next
  const tracking = stored?.tracking
  if (tracking === undefined) {
    if (next.tracking === undefined) return next
    const { tracking: _dropped, ...rest } = next
    return rest as WebsiteSchema
  }
  return { ...next, tracking }
}

export type { TrackingCodes }
