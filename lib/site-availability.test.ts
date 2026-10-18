import { describe, expect, it } from 'vitest'
import { siteHomeHref, siteUnavailableCopy } from './site-availability'
import { PLATFORM_CANONICAL_HOST, getTenantSlugFromHost, tenantHost } from './domains'

describe('siteUnavailableCopy', () => {
  it('is Turkish for tr visitors', () => {
    expect(siteUnavailableCopy('tr').title).toBe('Bu site şu an yayında değil')
  })

  it('is English for every other language', () => {
    expect(siteUnavailableCopy('en').title).toBe('This site is not available right now')
    expect(siteUnavailableCopy('de')).toEqual(siteUnavailableCopy('en'))
  })

  it('covers suspended and deleted sites without naming the cause', () => {
    expect(siteUnavailableCopy('tr').body).toMatch(/askıya alınmış/)
    expect(siteUnavailableCopy('en').body).toMatch(/suspended/)
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
