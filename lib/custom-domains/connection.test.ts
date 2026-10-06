import { describe, expect, it } from 'vitest'
import { buildDnsRecords, checkOwnership, runConnectionCheck, type ConnectionDeps } from './connection'
import { normalizeDomain } from './normalize'
import { EMPTY_CONNECTION, isDomainLive, type CustomDomain } from './types'
import type { VercelClient, VercelAddResult } from './vercel'

function fakeVercel(overrides: Partial<VercelClient> = {}): VercelClient {
  return {
    configured: true,
    addDomain: async () => ({ ok: true, verified: true, verification: [] }),
    verifyDomain: async () => ({ ok: true, verified: true, verification: [] }),
    getConfig: async () => ({ misconfigured: false, recommendedIPv4: [], recommendedCNAME: [] }),
    removeDomain: async () => ({ ok: true, alreadyAbsent: false }),
    setRedirect: async () => ({ ok: true, verified: true, verification: [] }),
    ...overrides,
  }
}

function deps(over: Partial<ConnectionDeps> = {}): ConnectionDeps {
  return {
    vercel: fakeVercel(),
    resolver: { txt: async () => [], a: async () => [], cname: async () => [] },
    probe: async () => true,
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

const input = { domain: 'firma.com', token: 'abc', dns: [], legacy: false }

describe('normalizeDomain reserved hosts', () => {
  it.each([
    'gloval.ai',
    'www.gloval.ai',
    'tenant.gloval.ai',
    'gloval.site',
    'www.gloval.site',
    'tenant.gloval.site',
  ])('rejects %s', (domain) => {
    expect(normalizeDomain(domain)).toEqual({ ok: false, error: 'reserved' })
  })

  it('still accepts an unrelated custom domain', () => {
    expect(normalizeDomain('firma.com')).toMatchObject({ ok: true, domain: 'firma.com' })
  })
})

describe('runConnectionCheck', () => {
  it('reaches live when vercel, dns and ssl are all ready', async () => {
    const r = await runConnectionCheck(input, deps())
    expect(r.connection).toMatchObject({ dns: 'configured', vercel: 'connected', ssl: 'ready' })
  })

  it('is not live when vercel is unconfigured, even with correct DNS', async () => {
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({ configured: false }),
      resolver: { txt: async () => [], a: async () => ['76.76.21.21'], cname: async () => [] },
    }))
    expect(r.connection).toMatchObject({ dns: 'configured', vercel: 'not_configured', ssl: 'pending' })
  })

  it('surfaces the Vercel ownership TXT challenge', async () => {
    const challenge: VercelAddResult = {
      ok: true,
      verified: false,
      verification: [{ type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=x' }],
    }
    const r = await runConnectionCheck(input, deps({ vercel: fakeVercel({ addDomain: async () => challenge, verifyDomain: async () => challenge }) }))
    expect(r.connection.vercel).toBe('needs_verification')
    expect(r.dns.find((d) => d.value === 'vc-domain-verify=x')?.host).toBe('_vercel')
  })

  it('captures vercel errors without throwing', async () => {
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({ addDomain: async () => ({ ok: false, code: 'domain_already_in_use', message: 'x' }) }),
    }))
    expect(r.connection).toMatchObject({ vercel: 'error', lastError: 'vercel:domain_already_in_use' })
  })

  it('keeps ssl pending while the HTTPS probe fails', async () => {
    const r = await runConnectionCheck(input, deps({ probe: async () => false }))
    expect(r.connection.ssl).toBe('pending')
  })

  it('leaves a legacy row untouched when vercel is not configured', async () => {
    const r = await runConnectionCheck({ ...input, legacy: true }, deps({ vercel: fakeVercel({ configured: false }) }))
    expect(r.connection.legacy).toBe(true)
  })
})

describe('checkOwnership / records', () => {
  it('matches the exact token value only', async () => {
    const record = { host: '_gloval', value: 'gloval-site-verification=abc' }
    const ok = { txt: async () => ['gloval-site-verification=abc'], a: async () => [], cname: async () => [] }
    const bad = { txt: async () => ['gloval-site-verification=zzz'], a: async () => [], cname: async () => [] }
    expect(await checkOwnership('firma.com', record, ok)).toBe('verified')
    expect(await checkOwnership('firma.com', record, bad)).toBe('missing')
  })

  it('emits real (non-placeholder) website and verification records', () => {
    const recs = buildDnsRecords({ domain: 'firma.com', token: 't', existing: [], ownershipVerified: false })
    expect(recs.every((r) => !r.placeholder)).toBe(true)
  })
})

const FIXED_A = '76.76.21.21'
const FIXED_CNAME = 'cname.vercel-dns.com'
const websiteRecords = <T extends { purpose: string }>(recs: T[]) => recs.filter((r) => r.purpose === 'website')

describe('website records come from Vercel only', () => {
  it('shows no website record at all before any Vercel answer exists', () => {
    const recs = buildDnsRecords({ domain: 'firma.com', token: 't', existing: [], ownershipVerified: true })
    expect(websiteRecords(recs)).toEqual([])
    expect(JSON.stringify(recs)).not.toContain(FIXED_A)
    expect(JSON.stringify(recs)).not.toContain(FIXED_CNAME)
  })

  it('uses the project-specific targets returned by the config API', async () => {
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({
        getConfig: async () => ({ misconfigured: true, recommendedIPv4: ['216.198.79.1'], recommendedCNAME: ['abc123.vercel-dns-017.com'] }),
      }),
    }))
    expect(websiteRecords(r.dns)).toMatchObject([
      { type: 'A', host: '@', value: '216.198.79.1', source: 'vercel', placeholder: false },
      { type: 'CNAME', host: 'www', value: 'abc123.vercel-dns-017.com', source: 'vercel', placeholder: false },
    ])
  })

  it('still reads the targets while Vercel waits for an extra TXT record', async () => {
    const challenge: VercelAddResult = {
      ok: true,
      verified: false,
      verification: [{ type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=firma.com,abc' }],
    }
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({
        addDomain: async () => challenge,
        verifyDomain: async () => challenge,
        getConfig: async () => ({ misconfigured: true, recommendedIPv4: ['216.198.79.1'], recommendedCNAME: ['abc123.vercel-dns-017.com'] }),
      }),
    }))
    expect(r.connection.vercel).toBe('needs_verification')
    expect(r.connection.ssl).toBe('pending')
    expect(websiteRecords(r.dns).map((x) => x.value)).toEqual(['216.198.79.1', 'abc123.vercel-dns-017.com'])
    expect(r.dns.filter((x) => x.purpose === 'verification').map((x) => x.value)).toEqual([
      'gloval-site-verification=abc',
      'vc-domain-verify=firma.com,abc',
    ])
  })

  it('does not fall back to fixed targets when the config API is unavailable', async () => {
    const r = await runConnectionCheck(input, deps({ vercel: fakeVercel({ getConfig: async () => null }) }))
    expect(websiteRecords(r.dns)).toEqual([])
    expect(JSON.stringify(r.dns)).not.toContain(FIXED_A)
    expect(r.inconclusive).toBe(true)
  })

  it('keeps targets Vercel reported earlier when a later config call fails', async () => {
    const previous = [
      { type: 'A' as const, host: '@', value: '216.198.79.1', purpose: 'website' as const, verified: false, source: 'vercel' as const, placeholder: false },
    ]
    const r = await runConnectionCheck({ ...input, dns: previous }, deps({ vercel: fakeVercel({ getConfig: async () => null }) }))
    expect(websiteRecords(r.dns).map((x) => x.value)).toEqual(['216.198.79.1'])
  })

  it('drops stale fixed website records that were never reported by Vercel', async () => {
    const stale = [
      { type: 'A' as const, host: '@', value: FIXED_A, purpose: 'website' as const, verified: false, placeholder: false },
    ]
    const r = await runConnectionCheck({ ...input, dns: stale }, deps({ vercel: fakeVercel({ getConfig: async () => null }) }))
    expect(websiteRecords(r.dns)).toEqual([])
  })
})

describe('Vercel verification requirements', () => {
  const run = (verification: Array<{ type: string; domain: string; value: string; reason?: string }>) => {
    const challenge: VercelAddResult = { ok: true, verified: false, verification }
    return runConnectionCheck(input, deps({ vercel: fakeVercel({ addDomain: async () => challenge, verifyDomain: async () => challenge }) }))
  }
  const extra = (recs: Awaited<ReturnType<typeof run>>['dns']) =>
    recs.filter((x) => x.purpose === 'verification' && x.source === 'vercel')

  it('keeps every challenge Vercel returns, with the host relative to the domain', async () => {
    const r = await run([
      { type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=a' },
      { type: 'TXT', domain: 'firma.com', value: 'vc-domain-verify=b' },
      { type: 'CNAME', domain: '_acme-challenge.firma.com', value: 'x.example.net' },
    ])
    expect(extra(r.dns).map((x) => [x.type, x.host, x.value])).toEqual([
      ['TXT', '_vercel', 'vc-domain-verify=a'],
      ['TXT', '@', 'vc-domain-verify=b'],
      ['CNAME', '_acme-challenge', 'x.example.net'],
    ])
  })

  it('does not invent a host when the challenge lies outside the domain', async () => {
    const r = await run([{ type: 'TXT', domain: '_vercel.baska.com', value: 'vc-domain-verify=z' }])
    expect(extra(r.dns)[0].host).toBe('_vercel.baska.com')
  })

  it('ignores record types it cannot represent and de-duplicates repeats', async () => {
    const r = await run([
      { type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=a' },
      { type: 'TXT', domain: '_vercel.firma.com', value: 'vc-domain-verify=a' },
      { type: 'WEIRD', domain: '_vercel.firma.com', value: 'nope' },
    ])
    expect(extra(r.dns)).toHaveLength(1)
  })

  it('reports a missing challenge instead of pretending to be connected', async () => {
    const r = await run([])
    expect(r.connection.vercel).toBe('needs_verification')
    expect(r.connection.lastError).toBe('vercel:challenge_missing')
  })
})

describe('separate DNS / hosting / SSL stages', () => {
  const cfg = (misconfigured: boolean) => async () => ({ misconfigured, recommendedIPv4: ['216.198.79.1'], recommendedCNAME: ['abc.vercel-dns-017.com'] })

  it('reports DNS as waiting when Vercel is attached but no record resolves yet', async () => {
    const r = await runConnectionCheck(input, deps({ vercel: fakeVercel({ getConfig: cfg(true) }) }))
    expect(r.connection).toMatchObject({ dns: 'pending', vercel: 'connected', ssl: 'pending' })
  })

  it('reports DNS as incorrect when the apex resolves somewhere else', async () => {
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({ getConfig: cfg(true) }),
      resolver: { txt: async () => [], a: async () => ['203.0.113.7'], cname: async () => [] },
    }))
    expect(r.connection).toMatchObject({ dns: 'misconfigured', vercel: 'connected', ssl: 'pending' })
  })

  it('never claims SSL ready while DNS is not configured', async () => {
    const r = await runConnectionCheck(input, deps({ vercel: fakeVercel({ getConfig: cfg(true) }), probe: async () => true }))
    expect(r.connection.ssl).toBe('pending')
  })

  it('does not reach connected when the verify call fails', async () => {
    const r = await runConnectionCheck(input, deps({
      vercel: fakeVercel({
        addDomain: async () => ({ ok: true, verified: false, verification: [] }),
        verifyDomain: async () => ({ ok: false, code: 'forbidden', message: 'x', status: 403, inconclusive: true }),
      }),
    }))
    expect(r.connection.vercel).toBe('error')
    expect(isDomainLive({ status: 'active', connection: r.connection } as CustomDomain)).toBe(false)
  })
})

describe('email records', () => {
  it('carries MX / SPF / DKIM / DMARC records through every check unchanged', async () => {
    const email = [
      { type: 'MX' as const, host: '@', value: 'mx.mail.example', priority: 10, purpose: 'email' as const, verified: true, placeholder: false },
      { type: 'TXT' as const, host: '@', value: 'v=spf1 include:_spf.example ~all', label: 'SPF' as const, purpose: 'email' as const, verified: true, placeholder: false },
      { type: 'TXT' as const, host: 'sel._domainkey', value: 'v=DKIM1; k=rsa; p=AAA', label: 'DKIM' as const, purpose: 'email' as const, verified: true, placeholder: false },
      { type: 'TXT' as const, host: '_dmarc', value: 'v=DMARC1; p=none', label: 'DMARC' as const, purpose: 'email' as const, verified: true, placeholder: false },
    ]
    const r = await runConnectionCheck({ ...input, dns: email }, deps())
    expect(r.dns.filter((x) => x.purpose === 'email')).toEqual(email)
    expect(r.dns.filter((x) => x.purpose !== 'email').every((x) => x.host !== '_dmarc' && x.label === undefined)).toBe(true)
  })
})

describe('isDomainLive', () => {
  const base = { status: 'active', connection: { ...EMPTY_CONNECTION } } as CustomDomain
  it('requires every stage for non-legacy rows', () => {
    expect(isDomainLive(base)).toBe(false)
    expect(isDomainLive({ ...base, connection: { ...EMPTY_CONNECTION, dns: 'configured', vercel: 'connected', ssl: 'ready' } })).toBe(true)
  })
  it('grandfathers legacy active rows and never serves pending ones', () => {
    expect(isDomainLive({ ...base, connection: { ...EMPTY_CONNECTION, legacy: true } })).toBe(true)
    expect(isDomainLive({ ...base, status: 'pending', connection: { ...EMPTY_CONNECTION, legacy: true } })).toBe(false)
  })
})
