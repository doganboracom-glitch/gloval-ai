import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { preflightGoogleAdsPublishUrl } from '@/lib/ads/google-ads-publish-preflight'
import { SNAPSHOT } from '@/lib/ads/testing/scan-fixtures'
import type { ScanGet } from '@/lib/ads/scan/http'
import type { ScanSiteResult } from '@/lib/ads/scan/scan-site'

const FINAL_URL = 'https://ornekmutfak.com/teklif?source=ads'
const CLEAN_PAGE = '<html lang="tr"><head><title>Landing Page</title><meta name="description" content="Hizmet bilgisi"></head><body><h1>Teklif isteyin</h1><p>Güvenilir hizmetler ve iletişim bilgileri.</p></body></html>'

function mockHttpGet(body: string | null = CLEAN_PAGE) {
  return vi.fn<ScanGet>(async (url) => ({
    status: url.pathname === '/robots.txt' ? 404 : body === null ? 404 : 200,
    location: null,
    contentType: 'text/html; charset=utf-8',
    xRobotsTag: null,
    bytes: Buffer.from(url.pathname === '/robots.txt' ? '' : body ?? ''),
    truncated: false,
  }))
}

describe('Google Ads publish destination preflight', () => {
  it('checks the exact landing path and the broader site snapshot with mocked transport', async () => {
    const httpGet = mockHttpGet()
    const scanSite = vi.fn(async (): Promise<ScanSiteResult> => ({ ok: true, snapshot: SNAPSHOT }))

    await expect(preflightGoogleAdsPublishUrl(FINAL_URL, { scanSite, httpGet })).resolves.toEqual({ ok: true })
    expect(httpGet.mock.calls.some(([url]) => url.href === FINAL_URL)).toBe(true)
    expect(scanSite).toHaveBeenCalledWith(FINAL_URL, expect.objectContaining({ httpGet }))
  })

  it('fails closed when the exact final URL is unreachable', async () => {
    const httpGet = mockHttpGet(null)
    const scanSite = vi.fn(async (): Promise<ScanSiteResult> => ({ ok: true, snapshot: SNAPSHOT }))

    await expect(preflightGoogleAdsPublishUrl(FINAL_URL, { scanSite, httpGet })).resolves.toEqual({
      ok: false,
      reason: 'destination_unreachable',
    })
    expect(scanSite).not.toHaveBeenCalled()
  })

  it('fails closed when the site snapshot cannot be scanned', async () => {
    const httpGet = mockHttpGet()
    const scanSite = vi.fn(async (): Promise<ScanSiteResult> => ({
      ok: false,
      code: 'unreachable',
      detail: 'BLOCKED',
    }))

    await expect(preflightGoogleAdsPublishUrl(FINAL_URL, { scanSite, httpGet })).resolves.toEqual({
      ok: false,
      reason: 'destination_unreachable',
    })
  })

  it.each([
    ['the exact destination', CLEAN_PAGE.replace('Landing Page', 'Canlı bahis hizmetleri'), SNAPSHOT],
    ['the site snapshot', CLEAN_PAGE, { ...SNAPSHOT, title: 'Kredi başvurusu seçenekleri' }],
  ] as const)('blocks restricted policy content in %s without returning evidence', async (_location, page, snapshot) => {
    const httpGet = mockHttpGet(page)
    const scanSite = vi.fn(async (): Promise<ScanSiteResult> => ({ ok: true, snapshot }))

    await expect(preflightGoogleAdsPublishUrl(FINAL_URL, { scanSite, httpGet })).resolves.toEqual({
      ok: false,
      reason: 'site_policy_blocked',
    })
  })
})
