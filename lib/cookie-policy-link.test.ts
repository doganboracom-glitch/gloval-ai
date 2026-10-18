import { describe, expect, it } from 'vitest'
import { cookieBannerHref, resolveCookieBannerDoc } from './cookie-policy-link'
import { hasCookiePolicyLink, withCookiePolicyLink } from './footer-links'
import { getSiteLegalDoc } from './site-legal-templates'
import type { WebsiteSchema } from './website-schema'

function corporate(hidden: string[] = []): WebsiteSchema {
  return { sections: [], ...(hidden.length ? { legalDocs: { hidden } } : {}) } as unknown as WebsiteSchema
}

describe('cookie banner link fallback', () => {
  it('links the Cookie Policy while it is visible', () => {
    expect(resolveCookieBannerDoc(corporate())).toBe('cerez-politikasi')
  })

  it('falls back to the Privacy Policy when the Cookie Policy is hidden', () => {
    expect(resolveCookieBannerDoc(corporate(['cerez-politikasi']))).toBe('gizlilik-politikasi')
  })

  it('shows no link when both are hidden (never a link to a 404)', () => {
    expect(resolveCookieBannerDoc(corporate(['cerez-politikasi', 'gizlilik-politikasi']))).toBeNull()
    expect(cookieBannerHref(null, '/')).toBeNull()
  })

  it('prefixes the target with the platform path, not on a tenant host', () => {
    expect(cookieBannerHref('cerez-politikasi', '/site/kahve/iletisim')).toBe('/site/kahve/yasal/cerez-politikasi')
    expect(cookieBannerHref('gizlilik-politikasi', '/iletisim')).toBe('/yasal/gizlilik-politikasi')
  })
})

describe('Cookie Policy template', () => {
  it('builds a document that names the company', () => {
    const doc = getSiteLegalDoc('cerez-politikasi', 'Kahve Durağı')
    expect(doc).not.toBeNull()
    expect(JSON.stringify(doc)).toContain('Kahve Durağı')
    expect(JSON.stringify(doc).toLowerCase()).toContain('çerez')
  })
})

describe('editor one-click "Çerez Politikası ekle"', () => {
  const privacyOnly = [{ label: 'Gizlilik Politikası', href: '/yasal/gizlilik-politikasi' }]

  it('appends the cookie link once', () => {
    expect(hasCookiePolicyLink(privacyOnly)).toBe(false)
    const next = withCookiePolicyLink(privacyOnly)
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({ label: 'Çerez Politikası', href: '/yasal/cerez-politikasi' })
    expect(hasCookiePolicyLink(next)).toBe(true)
  })

  it('never duplicates it and honours the language', () => {
    expect(withCookiePolicyLink(withCookiePolicyLink(privacyOnly))).toHaveLength(2)
    expect(withCookiePolicyLink([], 'en')[0].label).toBe('Cookie Policy')
  })
})
