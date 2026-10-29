import { describe, expect, it } from 'vitest'
import { buildBuyHref, buildDomainBuyPath, parseBuyParam } from './buy-link'

describe('buy-link', () => {
  it('builds a fixed same-site path for a clean domain', () => {
    expect(buildDomainBuyPath('marka.com')).toBe('/dashboard/domains?buy=marka.com')
  })

  it('refuses anything that is not a clean supported domain', () => {
    for (const bad of ['//evil.com', 'https://evil.com', 'marka.com&next=//evil.com', 'marka.xyz', '']) {
      expect(buildDomainBuyPath(bad)).toBeNull()
      expect(buildBuyHref(bad, false)).toBe('/dashboard/domains')
    }
  })

  it('sends signed-out visitors through auth and keeps the destination inside the site', () => {
    const href = buildBuyHref('marka.com', false)
    expect(href).toBe(`/auth/sign-up?next=${encodeURIComponent('/dashboard/domains?buy=marka.com')}`)
    expect(buildBuyHref('marka.com', false, 'login').startsWith('/auth/login?next=')).toBe(true)
    expect(buildBuyHref('marka.com', true)).toBe('/dashboard/domains?buy=marka.com')
  })

  it('parses the dashboard ?buy= value defensively', () => {
    expect(parseBuyParam('marka.net')).toBe('marka.net')
    expect(parseBuyParam(['marka.net', 'x.com'])).toBe('marka.net')
    expect(parseBuyParam('//evil.com')).toBeNull()
    expect(parseBuyParam(undefined)).toBeNull()
  })
})
