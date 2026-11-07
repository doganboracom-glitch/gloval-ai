import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { type MetaAdsErrorCode, metaAdsHttpStatus } from '@/lib/ads/meta-ads-error'

const ROOT = path.resolve(__dirname, '../..')

function allErrorCodes(): MetaAdsErrorCode[] {
  const source = readFileSync(path.join(ROOT, 'lib/ads/meta-ads-error.ts'), 'utf8')
  const block = source.slice(source.indexOf('export type MetaAdsErrorCode'), source.indexOf('export class MetaAdsError'))
  return [...block.matchAll(/\|\s*'([a-z_]+)'/g)].map((match) => match[1] as MetaAdsErrorCode)
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

describe('Meta rotalarında 502/504 kullanılmaz', () => {
  it('hata kodu listesi boş değildir', () => {
    expect(allErrorCodes().length).toBeGreaterThan(20)
  })

  it('hiçbir hata kodu 502 veya 504 durumuna eşlenmez', () => {
    for (const code of allErrorCodes()) {
      const status = metaAdsHttpStatus(code)
      expect([502, 504], code).not.toContain(status)
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThan(600)
    }
  })

  it('Meta ve token süresi rota dosyaları 502/504 sabiti içermez', () => {
    const files = [
      ...routeFiles(path.join(ROOT, 'app/api/ads/meta')),
      ...routeFiles(path.join(ROOT, 'app/api/cron/meta-token-expiry')),
      path.join(ROOT, 'lib/ads/meta-route-utils.ts'),
    ]
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, path.relative(ROOT, file)).not.toMatch(/\b50[24]\b/)
    }
  })
})
