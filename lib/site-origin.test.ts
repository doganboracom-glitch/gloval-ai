import { describe, expect, it } from 'vitest'
import { canonicalOrigin, pickCanonicalDomain, redirectsElsewhere, siteOrigin } from './site-origin'
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

  describe('www + apex where www redirects to the apex (dbajans.com.tr)', () => {
    const apex = (o: Partial<CustomDomain> = {}) =>
      domain({ id: 'apex', domain: 'dbajans.com.tr', createdAt: '2026-03-01T00:00:00.000Z', redirectTo: null, ...o })
    const www = (o: Partial<CustomDomain> = {}) =>
      domain({ id: 'www', domain: 'www.dbajans.com.tr', createdAt: '2026-01-01T00:00:00.000Z', redirectTo: 'dbajans.com.tr', ...o })

    it('picks the apex even though www is older', () => {
      expect(pickCanonicalDomain([www(), apex()])?.domain).toBe('dbajans.com.tr')
      expect(pickCanonicalDomain([apex(), www()])?.domain).toBe('dbajans.com.tr')
    })

    it('picks the apex even when the redirecting www is the one flagged primary', () => {
      expect(pickCanonicalDomain([www({ isPrimary: true }), apex()])?.domain).toBe('dbajans.com.tr')
    })

    it('keeps the primary flag meaningful among content-serving domains', () => {
      const other = domain({ id: 'o', domain: 'dbajans.net', isPrimary: true, redirectTo: null })
      expect(pickCanonicalDomain([www(), apex(), other])?.domain).toBe('dbajans.net')
    })

    it('treats a redirect to its own host, and an unknown redirect, as serving content', () => {
      expect(pickCanonicalDomain([www({ redirectTo: 'www.dbajans.com.tr' }), apex({ createdAt: '2027-01-01T00:00:00.000Z' })])?.domain).toBe(
        'www.dbajans.com.tr',
      )
      expect(pickCanonicalDomain([www({ redirectTo: undefined })])?.domain).toBe('www.dbajans.com.tr')
    })

    it('returns null when every live domain redirects, so the tenant origin is used', () => {
      expect(pickCanonicalDomain([www({ redirectTo: 'elsewhere.com' })])).toBeNull()
      expect(canonicalOrigin('dbajans', pickCanonicalDomain([www()] )?.domain)).toBe('https://dbajans.gloval.site')
    })

    it('feeds canonicalOrigin so every SEO surface gets the apex', () => {
      expect(canonicalOrigin('dbajans', pickCanonicalDomain([www(), apex()])?.domain)).toBe('https://dbajans.com.tr')
    })
  })
})

describe('redirectsElsewhere', () => {
  it('normalizes scheme, path, port and case of the reported target', () => {
    expect(redirectsElsewhere({ domain: 'www.a.com', redirectTo: 'A.com' })).toBe(true)
    expect(redirectsElsewhere({ domain: 'www.a.com', redirectTo: 'https://a.com/' })).toBe(true)
    expect(redirectsElsewhere({ domain: 'a.com', redirectTo: 'https://A.com:443/x' })).toBe(false)
    expect(redirectsElsewhere({ domain: 'a.com', redirectTo: null })).toBe(false)
    expect(redirectsElsewhere({ domain: 'a.com' })).toBe(false)
  })
})
