import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'
import { wordIncludes } from '@/lib/visual-subjects'
import { SCAN_LIMITS } from './config'
import { ScanFetchError, type ScanFetchErrorCode } from './errors'
import { extractPage, cleanText, type PageExtract } from './extract'
import { createScanFetcher, type FetchedPage } from './fetch-page'
import type { ScanGet } from './http'

/** What the AI stages (a later PR) are allowed to see about a site. Plain, bounded, sanitised data. */
export type SiteSnapshot = {
  host: string
  /** Host of the page that finally answered (differs from `host` after a cross-host redirect). */
  finalHost: string
  language: string | null
  title: string
  description: string
  siteName: string
  organizationNames: string[]
  headings: string[]
  navLabels: string[]
  text: string
  pages: Array<{ path: string; title: string }>
}

export type ScanFailureDetail = ScanFetchErrorCode | 'insufficient_content' | 'invalid_address'

/**
 * `code` is the only thing a visitor may be told. Every transport / SSRF /
 * robots failure collapses into `unreachable`; `detail` is for server logs.
 */
export type ScanSiteResult =
  | { ok: true; snapshot: SiteSnapshot }
  | { ok: false; code: 'invalid_address' | 'unreachable' | 'insufficient_content'; detail: ScanFailureDetail }

export type ScanSiteOptions = { httpGet?: ScanGet; now?: () => number }

const SKIPPED_EXTENSIONS = /\.(?:pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|docx?|xlsx?|pptx?|mp[34]|avi|mov|css|js|json|xml|txt)$/i

const LINK_CATEGORIES: Array<{ name: string; keys: string[] }> = [
  { name: 'about', keys: ['hakkimizda', 'hakkinda', 'kurumsal', 'biz kimiz', 'about', 'about us', 'who we are'] },
  {
    name: 'services',
    keys: [
      'hizmet', 'hizmetler', 'hizmetlerimiz', 'urun', 'urunler', 'urunlerimiz', 'cozumler',
      'services', 'products', 'solutions', 'what we do',
    ],
  },
  { name: 'contact', keys: ['iletisim', 'bize ulasin', 'contact', 'contact us'] },
]

const bareHost = (host: string) => host.replace(/^www\./, '')

/** Up to `maxExtraPages` same-site pages most useful for understanding the business (about, services, contact). */
export function pickExtraPages(home: URL, links: PageExtract['links']): URL[] {
  const picked: URL[] = []
  const usedCategories = new Set<string>()
  const seenPaths = new Set<string>([home.pathname])

  for (const category of LINK_CATEGORIES) {
    if (picked.length >= SCAN_LIMITS.maxExtraPages) break
    for (const link of links) {
      const href = link.href.trim()
      if (!href || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) continue
      let candidate: URL
      try {
        candidate = new URL(href, home)
      } catch {
        continue
      }
      if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') continue
      if (bareHost(candidate.hostname) !== bareHost(home.hostname)) continue
      candidate.hash = ''
      candidate.search = ''
      if (candidate.pathname === '/' || seenPaths.has(candidate.pathname)) continue
      if (SKIPPED_EXTENSIONS.test(candidate.pathname)) continue
      const haystack = `${link.label} ${decodeURIComponentSafe(candidate.pathname)}`
      if (!category.keys.some((key) => wordIncludes(haystack, key))) continue
      if (usedCategories.has(category.name)) break
      usedCategories.add(category.name)
      seenPaths.add(candidate.pathname)
      picked.push(candidate)
      break
    }
  }
  return picked
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function failure(error: unknown): ScanSiteResult {
  const detail: ScanFailureDetail = error instanceof ScanFetchError ? error.code : 'NETWORK'
  return { ok: false, code: 'unreachable', detail }
}

function pageUsable(page: FetchedPage, extract: PageExtract): boolean {
  return !page.headerForbidsUse && !extract.noindex
}

export async function scanSite(address: string, options: ScanSiteOptions = {}): Promise<ScanSiteResult> {
  const normalized = normalizeSiteAddress(address)
  if (!normalized.ok) return { ok: false, code: 'invalid_address', detail: 'invalid_address' }

  const now = options.now ?? Date.now
  const fetcher = createScanFetcher({
    httpGet: options.httpGet,
    now,
    deadline: now() + SCAN_LIMITS.totalTimeoutMs,
  })

  let homePage: FetchedPage
  try {
    homePage = await fetcher.fetchPage(new URL(normalized.url))
  } catch (error) {
    return failure(error)
  }
  const home = extractPage(homePage.html)
  if (!pageUsable(homePage, home)) return { ok: false, code: 'unreachable', detail: 'NOINDEX' }

  const extras: Array<{ url: URL; extract: PageExtract }> = []
  for (const url of pickExtraPages(homePage.finalUrl, home.links)) {
    try {
      const page = await fetcher.fetchPage(url)
      const extract = extractPage(page.html)
      if (pageUsable(page, extract)) extras.push({ url: page.finalUrl, extract })
    } catch {
      // An extra page that cannot be read only makes the snapshot a little thinner.
    }
  }

  const texts = [
    cleanText(home.text, SCAN_LIMITS.homeTextChars),
    ...extras.map((extra) => cleanText(extra.extract.text, SCAN_LIMITS.extraPageTextChars)),
  ]
  const text = cleanText(texts.filter(Boolean).join(' '), SCAN_LIMITS.snapshotTextChars)

  const unique = (values: string[], max: number) => [...new Set(values.filter(Boolean))].slice(0, max)
  const snapshot: SiteSnapshot = {
    host: normalized.host,
    finalHost: homePage.finalUrl.hostname.toLowerCase(),
    language: home.language,
    title: home.title,
    description: home.description,
    siteName: home.siteName,
    organizationNames: unique([...home.organizationNames, ...extras.flatMap((e) => e.extract.organizationNames)], 3),
    headings: unique([...home.headings, ...extras.flatMap((e) => e.extract.headings)], 20),
    navLabels: unique(home.navLabels, 20),
    text,
    pages: [
      { path: homePage.finalUrl.pathname, title: home.title },
      ...extras.map((e) => ({ path: e.url.pathname, title: e.extract.title })),
    ],
  }

  const informative = snapshot.title.length + snapshot.description.length + snapshot.headings.join('').length + text.length
  if (informative < 100) return { ok: false, code: 'insufficient_content', detail: 'insufficient_content' }
  return { ok: true, snapshot }
}
