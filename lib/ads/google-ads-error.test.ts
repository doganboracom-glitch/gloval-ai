import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GoogleAdsError, googleAdsErrorCode, googleAdsHttpStatus } from '@/lib/ads/google-ads-error'

const ROOT = process.cwd()

describe('google_access_level_insufficient', () => {
  it('is a first-class Google Ads error code with a 403 status', () => {
    const error = new GoogleAdsError('google_access_level_insufficient')
    expect(googleAdsErrorCode(error)).toBe('google_access_level_insufficient')
    expect(googleAdsHttpStatus('google_access_level_insufficient')).toBe(403)
  })

  it('shows the user message "erişim henüz onaylanmadı, destekle iletişime geçin" in the workspace and insights UI', () => {
    for (const file of ['components/ads/google-ads-workspace.tsx', 'components/ads/google-ads-insights.tsx']) {
      const source = readFileSync(join(ROOT, file), 'utf8')
      expect(source).toContain('google_access_level_insufficient')
      expect(source).toContain('Google Ads erişimi henüz onaylanmadı, destekle iletişime geçin.')
    }
  })

  it('shows the count and the code on the admin Google Ads page', () => {
    const source = readFileSync(join(ROOT, 'app/admin/google-ads/page.tsx'), 'utf8')
    expect(source).toContain("'google_access_level_insufficient'")
    expect(source).toContain('accessLevelCount')
    expect(source).toContain('Kod: ${GOOGLE_ACCESS_LEVEL_CODE}')
  })

  it('never introduces a developer token header or env variable', () => {
    const source = readFileSync(join(ROOT, 'lib/ads/google-api-client.ts'), 'utf8')
    expect(source.toLowerCase()).not.toMatch(/headers?\.(set|append)\(['"]developer-token/)
    expect(source).not.toContain('DEVELOPER_TOKEN')
  })
})
