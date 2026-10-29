import { describe, expect, it, vi } from 'vitest'
import { TtlCache } from '@/lib/custom-domains/public-search/cache'
import { parseBootstrap, findRdapServers } from './bootstrap'
import { isPublicIp } from './ip-guard'
import { createWhoisDeps, runWhoisLookup } from './service'
import type { HttpGet } from './http'

const bootstrap = parseBootstrap({
  services: [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['com.tr'], ['https://rdap.trabis.example/']],
    [['evil'], ['http://insecure.example/', 'https://127.0.0.1/']],
  ],
})

const allowAll = { reserve: vi.fn(async () => ({ allowed: true })), release: vi.fn(async () => {}) }

function deps(httpGet: HttpGet, limiter = allowAll) {
  return createWhoisDeps({
    limiter,
    httpGet,
    getBootstrap: async () => bootstrap,
    cache: new TtlCache(60_000),
  })
}

const ok = (body: unknown) => ({ status: 200, location: null, contentType: 'application/rdap+json', body: JSON.stringify(body) })

describe('bootstrap', () => {
  it('drops insecure and IP-literal servers and finds the longest suffix', () => {
    expect(bootstrap.servers.has('evil')).toBe(false)
    expect(findRdapServers(bootstrap, 'sirket.com.tr')).toEqual(['https://rdap.trabis.example/'])
    expect(findRdapServers(bootstrap, 'a.com')).toEqual(['https://rdap.verisign.com/com/v1/'])
    expect(findRdapServers(bootstrap, 'a.xyz')).toEqual([])
  })
})

describe('isPublicIp', () => {
  it.each(['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '172.16.0.1', '0.0.0.0', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1'])(
    'blocks %s',
    (ip) => expect(isPublicIp(ip)).toBe(false),
  )
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('allows %s', (ip) => expect(isPublicIp(ip)).toBe(true))
})

describe('runWhoisLookup', () => {
  it('rejects invalid input without touching the limiter or network', async () => {
    const httpGet = vi.fn()
    const limiter = { reserve: vi.fn(), release: vi.fn() }
    const res = await runWhoisLookup({ query: 'http://127.0.0.1', ip: '1.1.1.1' }, deps(httpGet as unknown as HttpGet, limiter as never))
    expect(res).toEqual({ ok: false, error: 'INVALID_QUERY' })
    expect(httpGet).not.toHaveBeenCalled()
    expect(limiter.reserve).not.toHaveBeenCalled()
  })

  it('returns a sanitized record for a registered domain', async () => {
    const httpGet: HttpGet = vi.fn(async () =>
      ok({ objectClassName: 'domain', ldhName: 'example.com', status: ['ok'], entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Secret Person']]] }] }),
    )
    const res = await runWhoisLookup({ query: 'Example.com', ip: '1.1.1.1' }, deps(httpGet))
    expect(res.ok && res.outcome.status).toBe('registered')
    expect(JSON.stringify(res)).not.toContain('Secret Person')
  })

  it('treats a 404 as available and buyable names keep the full domain', async () => {
    const httpGet: HttpGet = vi.fn(async () => ({ status: 404, location: null, contentType: null, body: '' }))
    const res = await runWhoisLookup({ query: 'free-name-123.com', ip: null }, deps(httpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'available', buyable: true, buyQuery: 'free-name-123.com' } })
  })

  it('reports NO_RDAP for an unknown extension and passes only the label on', async () => {
    const httpGet = vi.fn()
    const res = await runWhoisLookup({ query: 'name.xyz', ip: null }, deps(httpGet as unknown as HttpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'unavailable', reason: 'NO_RDAP', buyable: false, buyQuery: 'name' } })
    expect(httpGet).not.toHaveBeenCalled()
  })

  it('never reports a failure or a 5xx as available', async () => {
    const httpGet: HttpGet = vi.fn(async () => ({ status: 503, location: null, contentType: null, body: '' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'unavailable', reason: 'LOOKUP_FAILED' } })
  })

  it('does not follow a redirect to a host outside the bootstrap list', async () => {
    const httpGet = vi.fn(async (url: URL) =>
      url.hostname === 'rdap.verisign.com'
        ? { status: 302, location: 'https://attacker.example/x', contentType: null, body: '' }
        : ok({ objectClassName: 'domain' }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet as unknown as HttpGet))
    expect(res).toMatchObject({ ok: true, outcome: { status: 'unavailable', reason: 'LOOKUP_FAILED' } })
    expect(httpGet.mock.calls.every(([u]) => (u as URL).hostname === 'rdap.verisign.com')).toBe(true)
  })

  it('refuses when rate limited and when the counter is unreachable', async () => {
    const limited = { reserve: vi.fn(async () => ({ allowed: false })), release: vi.fn() }
    const httpGet = vi.fn()
    const res = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet as unknown as HttpGet, limited as never))
    expect(res).toMatchObject({ ok: false, error: 'RATE_LIMITED' })

    const broken = { reserve: vi.fn(async () => null), release: vi.fn() }
    const res2 = await runWhoisLookup({ query: 'example.com', ip: null }, deps(httpGet as unknown as HttpGet, broken as never))
    expect(res2).toEqual({ ok: false, error: 'UNAVAILABLE' })
    expect(httpGet).not.toHaveBeenCalled()
  })

  it('caches definitive answers', async () => {
    const httpGet = vi.fn(async () => ({ status: 404, location: null, contentType: null, body: '' }))
    const d = deps(httpGet as unknown as HttpGet)
    await runWhoisLookup({ query: 'cached-name.com', ip: null }, d)
    await runWhoisLookup({ query: 'cached-name.com', ip: null }, d)
    expect(httpGet).toHaveBeenCalledTimes(1)
  })
})
