import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpVercelClient } from './vercel'

type Call = { method: string; url: string }

function mockFetch(routes: Array<{ match: (c: Call) => boolean; status: number; body: unknown }>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      const call = { method: init?.method ?? 'GET', url }
      calls.push(call)
      const route = routes.find((r) => r.match(call))
      const status = route?.status ?? 404
      return { status, json: async () => route?.body ?? {} }
    }),
  )
  return calls
}

describe('HttpVercelClient (Vercel API response parsing)', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_API_TOKEN', 'tok')
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1')
    vi.stubEnv('VERCEL_TEAM_ID', '')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns the verification challenges from the add-domain response', async () => {
    mockFetch([
      {
        match: (c) => c.method === 'POST' && c.url.includes('/v10/projects/prj_1/domains'),
        status: 200,
        body: {
          name: 'firma.com',
          verified: false,
          verification: [{ type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=firma.com,abc', reason: 'pending_domain_verification' }],
        },
      },
    ])
    const res = await new HttpVercelClient().addDomain('firma.com')
    expect(res).toMatchObject({
      ok: true,
      verified: false,
      verification: [{ type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=firma.com,abc' }],
    })
  })

  it('treats a domain already attached to this project as success', async () => {
    mockFetch([
      { match: (c) => c.method === 'POST', status: 409, body: { error: { code: 'domain_already_in_use', message: 'in use' } } },
      { match: (c) => c.method === 'GET' && c.url.includes('/v9/projects/prj_1/domains/firma.com'), status: 200, body: { name: 'firma.com', verified: true } },
    ])
    const res = await new HttpVercelClient().addDomain('firma.com')
    expect(res).toMatchObject({ ok: true, verified: true, existing: true })
  })

  it('reports a domain claimed by another project as a failure, not a connection', async () => {
    mockFetch([
      { match: (c) => c.method === 'POST', status: 409, body: { error: { code: 'domain_already_in_use', message: 'in use' } } },
    ])
    const res = await new HttpVercelClient().addDomain('firma.com')
    expect(res).toMatchObject({ ok: false, code: 'domain_already_in_use', inconclusive: false })
  })

  it('parses ranked A / CNAME recommendations from the config endpoint and strips the trailing dot', async () => {
    const calls = mockFetch([
      {
        match: (c) => c.url.includes('/v6/domains/firma.com/config'),
        status: 200,
        body: {
          misconfigured: true,
          recommendedIPv4: [
            { rank: 2, value: ['10.0.0.2'] },
            { rank: 1, value: ['216.198.79.1'] },
          ],
          recommendedCNAME: [{ rank: 1, value: 'abc123.vercel-dns-017.com.' }],
        },
      },
    ])
    const config = await new HttpVercelClient().getConfig('firma.com')
    expect(config).toEqual({
      misconfigured: true,
      recommendedIPv4: ['216.198.79.1', '10.0.0.2'],
      recommendedCNAME: ['abc123.vercel-dns-017.com'],
    })
    expect(calls[0].url).toContain('projectIdOrName=prj_1')
  })

  it('returns null (unknown) when the config endpoint fails', async () => {
    mockFetch([{ match: () => true, status: 500, body: {} }])
    expect(await new HttpVercelClient().getConfig('firma.com')).toBeNull()
  })

  it('classifies rejected credentials and rate limits as inconclusive', async () => {
    for (const status of [401, 403, 429, 503]) {
      mockFetch([{ match: () => true, status, body: { error: { code: 'x', message: 'y' } } }])
      const res = await new HttpVercelClient().addDomain('firma.com')
      expect(res).toMatchObject({ ok: false, inconclusive: true })
    }
  })

  it('is not configured without a token and project id', () => {
    vi.stubEnv('VERCEL_API_TOKEN', '')
    expect(new HttpVercelClient().configured).toBe(false)
  })
})
