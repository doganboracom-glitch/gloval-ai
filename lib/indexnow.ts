import { findPublicPage, isPageIndexable, pagePath } from '@/lib/website-pages'
import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Pure IndexNow rules: key-file routing, URL selection, batching and retry
 * back-off. No I/O here; the HMAC key, the queue and the HTTP call live in
 * `lib/indexnow-server.ts`.
 */

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Time budget of one cron run (the step must never starve the other sweeps). */
export const INDEXNOW_BUDGET_MS = 10_000
/** Hard cap of URLs taken from the queue per cron run. */
export const INDEXNOW_MAX_URLS_PER_RUN = 200
/** URLs per request to the endpoint (the protocol allows 10 000; we stay small). */
export const INDEXNOW_BATCH_SIZE = 100
/** After this many failed sends a URL is dropped from the queue. */
export const INDEXNOW_MAX_ATTEMPTS = 6
/** Most URLs one editor action may queue. */
export const INDEXNOW_MAX_URLS_PER_ENQUEUE = 100

const KEY_FILE_PATH = /^\/([a-f0-9]{32})\.txt$/

/** `/<key>.txt` -> the key, or null for any other path. */
export function indexNowKeyFromPath(pathname: string): string | null {
  const match = KEY_FILE_PATH.exec(pathname)
  return match ? match[1] : null
}

/** Internal route that serves a project's key file (static segment, beats `[page]`). */
export const INDEXNOW_KEY_ROUTE = 'indexnow-key'

/**
 * Internal path a tenant request is rewritten to. Shared by the subdomain and
 * custom-domain branches of the middleware so both route the key file alike.
 */
export function tenantRewritePath(slug: string, pathname: string): string {
  const key = indexNowKeyFromPath(pathname)
  if (key) return `/site/${slug}/${INDEXNOW_KEY_ROUTE}/${key}`
  return `/site/${slug}${pathname === '/' ? '' : pathname}`
}

/** Public location of the key file on `host`, as the protocol's `keyLocation`. */
export function indexNowKeyLocation(host: string, key: string): string {
  return `https://${host}/${key}.txt`
}

/** Seconds-free exponential back-off: 5 min, 20 min, 80 min, ... capped at 24 h. */
export function retryDelayMs(attempts: number): number {
  const step = Math.max(1, Math.floor(attempts))
  return Math.min(5 * 60_000 * 4 ** (step - 1), 24 * 60 * 60_000)
}

export type QueueRow = { id: number; project_id: string; url: string; attempts: number }

export type HostGroup = { projectId: string; host: string; rows: QueueRow[] }

/** Groups due rows per (project, host). Non-https and unparsable URLs are returned as `invalid`. */
export function groupByHost(rows: readonly QueueRow[]): { groups: HostGroup[]; invalid: QueueRow[] } {
  const groups = new Map<string, HostGroup>()
  const invalid: QueueRow[] = []
  for (const row of rows) {
    let host: string | null = null
    try {
      const parsed = new URL(row.url)
      if (parsed.protocol === 'https:' && parsed.hostname) host = parsed.host.toLowerCase()
    } catch {
      host = null
    }
    if (!host) {
      invalid.push(row)
      continue
    }
    const id = `${row.project_id}|${host}`
    const group = groups.get(id) ?? { projectId: row.project_id, host, rows: [] }
    group.rows.push(row)
    groups.set(id, group)
  }
  return { groups: [...groups.values()], invalid }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function buildIndexNowBody(host: string, key: string, urls: readonly string[]) {
  return { host, key, keyLocation: indexNowKeyLocation(host, key), urlList: [...urls] }
}

/** 200/202 accepted. Everything else is retried later with back-off. */
export function isIndexNowAccepted(status: number): boolean {
  return status === 200 || status === 202
}

/**
 * Canonical, indexable URLs of a site's pages (home included) under `base`.
 * Mirrors the sitemap: the same pages that are listed there are the ones pinged.
 */
export function sitePageUrls(base: string, schema: WebsiteSchema): string[] {
  const urls = [base]
  for (const [i, page] of (schema.pages ?? []).entries()) {
    const pageSlug = page.slug || `page-${i}`
    const resolved = findPublicPage(schema, pageSlug)
    if (!resolved || !isPageIndexable(resolved)) continue
    urls.push(`${base}${pagePath(schema, pageSlug)}`)
  }
  return urls
}

/** The post URL, the blog index and the feed: all change together with a post. */
export function blogUrls(base: string, postSlugs: readonly string[]): string[] {
  return [...postSlugs.map((slug) => `${base}/blog/${slug}`), `${base}/blog`, `${base}/blog/rss.xml`]
}

/**
 * Google does not support IndexNow: owners submit the sitemap in Search
 * Console. Fixed copy for the editor (never built from user input).
 */
export const SEARCH_CONSOLE_NOTE = {
  tr: "Google IndexNow'u desteklemez. Yeni sayfa ve yazıların Google'da daha hızlı görünmesi için sitemap adresinizi (/sitemap.xml) Google Search Console'a gönderin.",
  en: 'Google does not support IndexNow. To get new pages and posts into Google faster, submit your sitemap (/sitemap.xml) in Google Search Console.',
} as const

export function searchConsoleNote(lang: string | null | undefined): string {
  return lang === 'en' ? SEARCH_CONSOLE_NOTE.en : SEARCH_CONSOLE_NOTE.tr
}
