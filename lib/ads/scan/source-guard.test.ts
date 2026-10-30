import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.join(process.cwd(), 'lib/ads/scan')

function sources() {
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => ({
      name,
      code: readFileSync(path.join(DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1'),
    }))
}

describe('the scanner has exactly one way to touch the network', () => {
  const files = sources()

  it('finds its sources', () => {
    expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['http.ts', 'fetch-page.ts', 'scan-site.ts']))
  })

  it('only http.ts imports a network module', () => {
    const offenders = files
      .filter((f) => /from\s+['"](?:node:)?(?:http|https|http2|net|tls|dgram|dns|child_process)['"]|from\s+['"]undici['"]/.test(f.code))
      .map((f) => f.name)
    expect(offenders).toEqual(['http.ts'])
  })

  it('never uses the global fetch, XMLHttpRequest or a WebSocket', () => {
    const offenders = files
      .filter((f) => /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|\bnavigator\.sendBeacon/.test(f.code))
      .map((f) => f.name)
    expect(offenders).toEqual([])
  })

  it('the transport always installs the SSRF-guarded lookup and verifies TLS', () => {
    const http = files.find((f) => f.name === 'http.ts')!.code
    expect(http).toMatch(/createGuardedLookup/)
    expect(http).toMatch(/lookup:\s*lookup/)
    expect(http).not.toMatch(/rejectUnauthorized\s*:\s*false/)
    expect(http).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED/)
    expect(http).not.toMatch(/\.setHeader\(\s*['"]cookie/i)
  })

  it('never evaluates scanned content', () => {
    const offenders = files.filter((f) => /\beval\s*\(|new\s+Function\s*\(|\bvm\./.test(f.code)).map((f) => f.name)
    expect(offenders).toEqual([])
  })
})
