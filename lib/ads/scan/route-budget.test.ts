import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SCAN_LIMITS } from './config'

/** The server may only spend its scan budget this many seconds short of the function limit. */
const MIN_HEADROOM_SECONDS = 5
const MIN_MAX_DURATION_SECONDS = 30

/** Next.js reads `maxDuration` statically from the route file, so it cannot be imported from config. */
function readMaxDuration(routeFile: string): number {
  const source = readFileSync(path.join(process.cwd(), routeFile), 'utf8')
  const match = /^export const maxDuration = (\d+)\s*$/m.exec(source)
  if (!match) throw new Error(`${routeFile} does not export a literal maxDuration`)
  return Number(match[1])
}

// Every route that ends up calling scanSite().
const SCANNING_ROUTES = [
  'app/api/ads/scan/route.ts',
  'app/api/ads/google/publish/route.ts',
]

describe('scan time budget versus the serverless function limit', () => {
  it('keeps a single request inside the whole-scan budget', () => {
    expect(SCAN_LIMITS.requestTimeoutMs).toBeLessThanOrEqual(SCAN_LIMITS.totalTimeoutMs)
  })

  for (const routeFile of SCANNING_ROUTES) {
    describe(routeFile, () => {
      const maxDuration = readMaxDuration(routeFile)

      it(`exports maxDuration of at least ${MIN_MAX_DURATION_SECONDS}s`, () => {
        expect(maxDuration).toBeGreaterThanOrEqual(MIN_MAX_DURATION_SECONDS)
      })

      it(`keeps the server-side scan budget at least ${MIN_HEADROOM_SECONDS}s below maxDuration`, () => {
        expect(SCAN_LIMITS.totalTimeoutMs).toBeLessThanOrEqual((maxDuration - MIN_HEADROOM_SECONDS) * 1000)
      })
    })
  }
})
