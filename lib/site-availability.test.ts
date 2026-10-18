import { describe, expect, it } from 'vitest'
import { classifyMissingSite, siteHomeHref } from './site-availability'
import { PLATFORM_CANONICAL_HOST, getTenantSlugFromHost, tenantHost } from './domains'

describe('classifyMissingSite', () => {
  it('a project that exists but is not served is "unpublished"', () => {
    expect(classifyMissingSite({ published: false })).toBe('unpublished')
    expect(classifyMissingSite({ published: null })).toBe('unpublished')
  })

  it('no project at all is "missing"', () => {
    expect(classifyMissingSite(null)).toBe('missing')
    expect(classifyMissingSite(undefined)).toBe('missing')
  })
})

describe('siteHomeHref (404 "Ana sayfaya dön")', () => {
  it('returns the site root on a tenant host or custom domain', () => {
    expect(siteHomeHref('/olmayan-yol')).toBe('/')
    expect(siteHomeHref('/blog/yok')).toBe('/')
    expect(siteHomeHref('/')).toBe('/')
  })

  it('stays inside the site on the platform path prefix', () => {
    expect(siteHomeHref('/site/kahveduragi/olmayan-yol')).toBe('/site/kahveduragi')
    expect(siteHomeHref('/site/kahveduragi')).toBe('/site/kahveduragi')
  })

  it('falls back to the root without a pathname', () => {
    expect(siteHomeHref(null)).toBe('/')
    expect(siteHomeHref(undefined)).toBe('/')
  })
})

describe('custom domain routing assumptions', () => {
  it('a custom domain is not a tenant subdomain, so its 404 uses the root home link', () => {
    expect(getTenantSlugFromHost('www.firmam.com')).toBeNull()
    expect(getTenantSlugFromHost(tenantHost('kahveduragi'))).toBe('kahveduragi')
    expect(getTenantSlugFromHost(PLATFORM_CANONICAL_HOST)).toBeNull()
    expect(siteHomeHref('/yok')).toBe('/')
  })
})
