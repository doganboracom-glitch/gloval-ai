import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TtlCache } from '@/lib/custom-domains/public-search/cache'
import { dictionary } from '@/lib/i18n'
import { findRdapServers, parseBootstrap } from './bootstrap'
import type { HttpGet } from './http'
import { WHOIS_LIMITS } from './limits'
import { createWhoisDeps, runWhoisLookup, WHOIS_TOTAL_TIMEOUT_MS } from './service'

const read = (name: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as Record<string, unknown>

// Real IANA bootstrap (data.iana.org/rdap/dns.json) and a real Verisign answer for example.com.
const ianaBootstrap = parseBootstrap(read('iana-dns-bootstrap.json'))
const exampleCom = read('rdap-example-com.json')
const missingCom = read('rdap-missing-com.json') as { status: number }

const allowAll = { reserve: async () => ({ allowed: true }), release: async () => {} }

function deps(httpGet: HttpGet) {
  return createWhoisDeps({ limiter: allowAll as never, httpGet, getBootstrap: async () => ianaBootstrap, cache: new TtlCache(60_000) })
}

const respond = (status: number, body: unknown): HttpGet =>
  vi.fn(async () => ({ status, location: null, contentType: 'application/rdap+json', body: JSON.stringify(body) }))

describe('IANA bootstrap (real file)', () => {
  it.each(['example.com', 'example.net', 'example.org', 'example.info'])('%s resolves to an https RDAP server', (domain) => {
    const servers = findRdapServers(ianaBootstrap, domain)
    expect(servers.length).toBeGreaterThan(0)
    for (const server of servers) expect(server.startsWith('https://')).toBe(true)
  })

  it('has no RDAP service for .co or .tr (so .com.tr)', () => {
    expect(findRdapServers(ianaBootstrap, 'ornek.co')).toEqual([])
    expect(findRdapServers(ianaBootstrap, 'ornek.com.tr')).toEqual([])
    expect(findRdapServers(ianaBootstrap, 'ornek.tr')).toEqual([])
  })
})

describe('unsupported extensions', () => {
  it.each(['ornek.co', 'ornek.com.tr'])('%s reports NO_RDAP without any network call', async (domain) => {
    const httpGet = vi.fn()
    const res = await runWhoisLookup({ query: domain, ip: null }, deps(httpGet as unknown as HttpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'unavailable', reason: 'NO_RDAP', buyable: true } })
    expect(httpGet).not.toHaveBeenCalled()
  })

  it('the page tells the user the extension is not supported and never says "available"', () => {
    expect(dictionary.tr.whois.noRdapNote).toContain('desteklenmiyor')
    expect(dictionary.tr.whois.noRdapBuyNote).toContain('desteklenmiyor')
  })
})

describe('real RDAP responses', () => {
  it('200 for example.com is reported as registered with a sanitized record', async () => {
    const httpGet = respond(200, exampleCom)
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'registered', domain: 'example.com' } })
    if (!res.ok || res.outcome.status !== 'registered') throw new Error('expected registered')
    expect(res.outcome.record.domain).toBe('example.com')
    expect(res.outcome.record.nameservers.length).toBeGreaterThan(0)
    expect(res.outcome.record.statuses.length).toBeGreaterThan(0)
    const url = (httpGet as ReturnType<typeof vi.fn>).mock.calls[0][0] as URL
    expect(url.protocol).toBe('https:')
    expect(url.hostname).toBe('rdap.verisign.com')
  })

  it('the real 404 for a free name is reported as "available" (müsait görünüyor)', async () => {
    expect(missingCom.status).toBe(404)
    const res = await runWhoisLookup({ query: 'gloval-yok-b7q2x9k4m1.com', ip: null }, deps(respond(404, missingCom)))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'available', buyable: true } })
  })
})

describe('personal data never reaches the client', () => {
  const pii = ['Ali Veli', 'ali.veli@example.org', '+90 555 123 45 67', 'Ataturk Cad. 1 Ankara', 'registrant-secret-handle']
  const withRegistrant = {
    ...exampleCom,
    entities: [
      ...((exampleCom.entities as unknown[]) ?? []),
      {
        handle: 'registrant-secret-handle',
        roles: ['registrant'],
        vcardArray: [
          'vcard',
          [
            ['fn', {}, 'text', 'Ali Veli'],
            ['email', {}, 'text', 'ali.veli@example.org'],
            ['tel', {}, 'uri', '+90 555 123 45 67'],
            ['adr', {}, 'text', ['', '', 'Ataturk Cad. 1 Ankara', '', '', '', '']],
          ],
        ],
      },
    ],
    remarks: [{ description: ['Ali Veli private note'] }],
  }

  it('drops registrant, e-mail, phone, address and the raw RDAP JSON', async () => {
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(respond(200, withRegistrant)))
    const json = JSON.stringify(res)
    for (const value of pii) expect(json).not.toContain(value)
    for (const rawKey of ['vcardArray', 'entities', 'remarks', 'rdapConformance', 'notices', 'links', 'handle']) {
      expect(json).not.toContain(`"${rawKey}"`)
    }
    expect(Object.keys((res as { outcome: { record: object } }).outcome.record).sort()).toEqual(
      ['dnssec', 'domain', 'expiresAt', 'nameservers', 'registeredAt', 'registrar', 'statuses', 'updatedAt'].sort(),
    )
  })
})

describe('SSRF and policy', () => {
  it('refuses a server that sends a redirect to a host outside the bootstrap list', async () => {
    const httpGet: HttpGet = vi.fn(async () => ({
      status: 302,
      location: 'https://169.254.169.254/latest/meta-data',
      contentType: null,
      body: '',
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'unavailable', reason: 'LOOKUP_FAILED' } })
    expect((httpGet as ReturnType<typeof vi.fn>).mock.calls.every(([url]) => (url as URL).hostname === 'rdap.verisign.com')).toBe(true)
  })

  it('an input that is an IP, URL or has a port or path is rejected before any request', async () => {
    const httpGet = vi.fn()
    for (const query of ['127.0.0.1', 'http://example.com', 'example.com:8080', 'example.com/x', 'localhost', '[::1]']) {
      const res = await runWhoisLookup({ query, ip: null }, deps(httpGet as unknown as HttpGet))
      expect(res).toEqual({ ok: false, error: 'INVALID_QUERY' })
    }
    expect(httpGet).not.toHaveBeenCalled()
  })
})

describe('limits and timeouts (values the page relies on)', () => {
  it('pins the per-IP budget, cache TTL and total timeout', () => {
    expect(WHOIS_LIMITS).toEqual([
      { seconds: 60, limit: 8 },
      { seconds: 3600, limit: 80 },
    ])
    expect(WHOIS_TOTAL_TIMEOUT_MS).toBe(6000)
  })

  it('caches a definitive answer for 10 minutes and not longer', async () => {
    let now = 1_000_000
    const httpGet = respond(200, exampleCom)
    const cache = new TtlCache<never>(10 * 60 * 1000, 500, () => now) as never
    const d = createWhoisDeps({ limiter: allowAll as never, httpGet, getBootstrap: async () => ianaBootstrap, cache, now: () => now })
    await runWhoisLookup({ query: 'example.com', ip: null }, d)
    await runWhoisLookup({ query: 'example.com', ip: null }, d)
    expect(httpGet).toHaveBeenCalledTimes(1)
    now += 10 * 60 * 1000 + 1
    await runWhoisLookup({ query: 'example.com', ip: null }, d)
    expect(httpGet).toHaveBeenCalledTimes(2)
  })
})
