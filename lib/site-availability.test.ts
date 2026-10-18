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

  it('covers closed, suspended and unpublished sites without naming the cause', () => {
    expect(siteUnavailableCopy('tr').body).toBe(
      'Aradığınız site kapatılmış, askıya alınmış ya da henüz yayına alınmamış olabilir.',
    )
    expect(siteUnavailableCopy('en').body).toMatch(/taken down, suspended, or not published yet/)
  })

  it('points owners at the dashboard and a support ticket link', () => {
    const tr = siteUnavailableCopy('tr')
    expect(`${tr.ownerNote.before}${tr.ownerNote.link}${tr.ownerNote.after}`).toBe(
      'Bu site size aitse GLOVAL AI paneline giriş yaparak sitenizi yayına alabilir veya destek talebi oluşturabilirsiniz.',
    )
    expect(tr.ownerNote.link).toBe('destek talebi')
    expect(tr.homeButton).toBe("GLOVAL AI'a git")
    expect(siteUnavailableCopy('en').homeButton).toBe('Go to GLOVAL AI')
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
