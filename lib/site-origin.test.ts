import { describe, expect, it } from 'vitest'
import { canonicalOrigin, pickCanonicalDomain, siteOrigin } from './site-origin'
import { tenantUrl } from './domains'
import type { CustomDomain } from './custom-domains/types'

function domain(overrides: Partial<CustomDomain>): CustomDomain {
  return {
    id: 'd1',
    userId: 'u1',
    domain: 'example.com',
    status: 'active',
    isPrimary: false,
    dns: [],
    websiteProjectId: 'p1',
    emailEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    connection: {
      dns: 'configured',
      vercel: 'connected',
      ssl: 'ready',
      lastCheckedAt: null,
      lastError: null,
      legacy: false,
    },
    mock: false,
    source: 'external',
    expiresAt: null,
    ...overrides,
  } as CustomDomain
}

describe('siteOrigin', () => {
  it('normalizes hosts into https origins', () => {
    expect(siteOrigin('Example.COM')).toBe('https://example.com')
    expect(siteOrigin('shop.example.com:443')).toBe('https://shop.example.com')
    expect(siteOrigin('example.com.')).toBe('https://example.com')
  })

  it('rejects empty and non-hostname values', () => {
    expect(siteOrigin('')).toBeNull()
    expect(siteOrigin(null)).toBeNull()
    expect(siteOrigin('localhost')).toBeNull()
    expect(siteOrigin('evil.com/path')).toBeNull()
    expect(siteOrigin('a b.com')).toBeNull()
  })
})

describe('canonicalOrigin', () => {
  it('uses the custom host when valid and the tenant subdomain otherwise', () => {
    expect(canonicalOrigin('kahve', 'kahve.com')).toBe('https://kahve.com')
    expect(canonicalOrigin('kahve', null)).toBe(tenantUrl('kahve'))
    expect(canonicalOrigin('kahve', 'not a host')).toBe(tenantUrl('kahve'))
  })
})

describe('pickCanonicalDomain', () => {
  it('ignores domains not bound to a project', () => {
    expect(pickCanonicalDomain([domain({ websiteProjectId: null })])).toBeNull()
  })

  it('ignores domains that are not active', () => {
    expect(pickCanonicalDomain([domain({ status: 'pending' as CustomDomain['status'] })])).toBeNull()
  })

  it('ignores active domains whose DNS/SSL is not connected yet', () => {
    const notReady = domain({
      connection: { ...domain({}).connection, ssl: 'pending' },
    })
    expect(pickCanonicalDomain([notReady])).toBeNull()
  })

  it('prefers primary, then the oldest', () => {
    const older = domain({ id: 'a', domain: 'older.com', createdAt: '2025-01-01T00:00:00.000Z' })
    const newer = domain({ id: 'b', domain: 'newer.com', createdAt: '2026-01-01T00:00:00.000Z' })
    const primary = domain({ id: 'c', domain: 'primary.com', isPrimary: true, createdAt: '2026-06-01T00:00:00.000Z' })
    expect(pickCanonicalDomain([newer, older])?.domain).toBe('older.com')
    expect(pickCanonicalDomain([newer, older, primary])?.domain).toBe('primary.com')
  })
})
