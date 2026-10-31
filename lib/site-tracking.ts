import type { TrackingCodes, WebsiteSchema } from '@/lib/website-schema'
import type { PlanCode } from '@/lib/pricing-config'

/**
 * Owner-supplied third-party code (analytics, tag manager, pixels, and site
 * verification, including Google Search Console) is stored verbatim on the
 * website schema and injected into the PUBLISHED site only. These helpers keep
 * that injection predictable:
 *
 *  - Customer verification tags are preserved. Generated OG/Twitter tags and
 *    canonical links are owned by site metadata and filtered from snippets.
 *  - Everything else (scripts, noscript, and non-canonical links) is injected
 *    as raw HTML into the document exactly as pasted — no escaping, no rewriting.
 */

const META_TAG = /<meta\b[^>]*>/gi

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`(?:\\s|^)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? null
}

/**
 * Extracts `<meta name|property="…" content="…">` pairs into Next.js
 * metadata. Customer verification tags are preserved; generated descriptions,
 * robots, Open Graph, Twitter, and canonical metadata remain platform-owned.
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
      ['viewport', 'charset', 'description', 'robots', 'googlebot', 'canonical'].includes(normalizedName) ||
      normalizedName.startsWith('og:') ||
      normalizedName.startsWith('twitter:')
    ) {
      continue
    }
    result[name] = content
  }
  return result
}

/** The head snippet without meta tags or canonical links owned by site metadata. */
export function stripMetaTags(code?: string | null): string {
  if (!code) return ''
  return code
    .replace(META_TAG, '')
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const rel = attr(tag, 'rel')
      return rel?.split(/\s+/).some((value) => value.toLowerCase() === 'canonical') ? '' : tag
    })
    .trim()
}

const UNSAFE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['javascript_uri', /javascript\s*:/i],
  ['html_data_uri', /data\s*:\s*text\/html/i],
  ['meta_refresh', /<\s*meta\b[^>]*http-equiv\s*=\s*["']?\s*(refresh|set-cookie|content-security-policy)/i],
  ['base_tag', /<\s*base\b/i],
  ['form_tag', /<\s*form\b/i],
  ['object_embed', /<\s*(object|embed)\b/i],
  ['insecure_script', /<\s*script\b[^>]*\bsrc\s*=\s*["']?\s*http:\/\//i],
]

/**
 * Names of harmful patterns that invalidate an owner snippet. A conflicting
 * canonical link is stripped separately so the rest of a valid snippet survives.
 * These patterns redirect visitors, hijack relative URLs, or phish.
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
