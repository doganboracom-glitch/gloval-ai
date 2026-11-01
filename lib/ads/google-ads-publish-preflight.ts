import 'server-only'

import { evaluateSnapshotPolicy } from '@/lib/ads/policy'
import { SCAN_LIMITS } from '@/lib/ads/scan/config'
import { cleanText, extractPage } from '@/lib/ads/scan/extract'
import { createScanFetcher, type FetchedPage } from '@/lib/ads/scan/fetch-page'
import type { ScanGet } from '@/lib/ads/scan/http'
import { scanSite, type ScanSiteOptions, type ScanSiteResult, type SiteSnapshot } from '@/lib/ads/scan/scan-site'

export type GoogleAdsPublishPreflightResult =
  | { ok: true }
  | { ok: false; reason: 'destination_unreachable' | 'site_policy_blocked' }

export type GoogleAdsPublishPreflightDeps = {
  scanSite: typeof scanSite
  httpGet?: ScanGet
  now?: () => number
}

const defaultDeps: GoogleAdsPublishPreflightDeps = { scanSite }

function snapshotFromFinalPage(startUrl: URL, page: FetchedPage): SiteSnapshot | null {
  const extract = extractPage(page.html)
  if (page.headerForbidsUse || extract.noindex) return null

  return {
    host: startUrl.hostname.toLowerCase(),
    finalHost: page.finalUrl.hostname.toLowerCase(),
    language: extract.language,
    title: extract.title,
    description: extract.description,
    siteName: extract.siteName,
    organizationNames: extract.organizationNames.slice(0, 3),
    headings: extract.headings.slice(0, 20),
    navLabels: extract.navLabels.slice(0, 20),
    text: cleanText(extract.text, SCAN_LIMITS.snapshotTextChars),
    pages: [{ path: page.finalUrl.pathname, title: extract.title }],
  }
}

/** Rechecks the exact final URL and the broader site snapshot with the SSRF-safe scanner. */
export async function preflightGoogleAdsPublishUrl(
  finalUrl: string,
  deps: GoogleAdsPublishPreflightDeps = defaultDeps,
): Promise<GoogleAdsPublishPreflightResult> {
  try {
    const target = new URL(finalUrl)
    const now = deps.now ?? Date.now
    const fetcher = createScanFetcher({
      httpGet: deps.httpGet,
      now,
      deadline: now() + SCAN_LIMITS.totalTimeoutMs,
    })
    const finalPage = await fetcher.fetchPage(target)
    const exactSnapshot = snapshotFromFinalPage(target, finalPage)
    if (!exactSnapshot) return { ok: false, reason: 'destination_unreachable' }
    if (evaluateSnapshotPolicy(exactSnapshot).verdict !== 'allowed') {
      return { ok: false, reason: 'site_policy_blocked' }
    }

    const scanOptions: ScanSiteOptions = { httpGet: deps.httpGet, now }
    const siteScan: ScanSiteResult = await deps.scanSite(finalUrl, scanOptions)
    if (!siteScan.ok) return { ok: false, reason: 'destination_unreachable' }
    if (evaluateSnapshotPolicy(siteScan.snapshot).verdict !== 'allowed') {
      return { ok: false, reason: 'site_policy_blocked' }
    }

    return { ok: true }
  } catch {
    return { ok: false, reason: 'destination_unreachable' }
  }
}
