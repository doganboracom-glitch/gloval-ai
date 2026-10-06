import type { TrackingCodes } from '@/lib/website-schema'

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
 * Extracts `<meta name|property="…" content="…">` pairs from a head snippet so
 * they can be rendered through Next.js metadata (`other`). Charset/viewport and
 * anything without a usable name are skipped so platform metadata stays intact.
 */
export function extractMetaTags(code?: string | null): Record<string, string> {
  if (!code) return {}
  const result: Record<string, string> = {}
  for (const tag of code.match(META_TAG) ?? []) {
    const name = attr(tag, 'name') ?? attr(tag, 'property')
    const content = attr(tag, 'content')
    if (!name || content === null) continue
    if (['viewport', 'charset', 'description'].includes(name.toLowerCase())) continue
    result[name] = content
  }
  return result
}

/** The head snippet without its `<meta>` tags (those go through metadata). */
export function stripMetaTags(code?: string | null): string {
  if (!code) return ''
  return code.replace(META_TAG, '').trim()
}

/** True when a snippet has anything worth injecting. */
export function hasCode(code?: string | null): boolean {
  return Boolean(code && code.trim().length > 0)
}

export type { TrackingCodes }
