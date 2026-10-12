import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  accountLinkLabel,
  shouldShowAccountLink,
  storeAccountHref,
  storeSessionApiHref,
} from './store-header-links'

const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('store account link helpers', () => {
  it('points at the tenant account page', () => {
    expect(storeAccountHref('demo')).toBe('/site/demo/hesap')
    expect(storeSessionApiHref('a b')).toBe('/api/store/session?slug=a%20b')
  })

  it('labels by login state and language', () => {
    expect(accountLinkLabel(false)).toBe('Giriş yap')
    expect(accountLinkLabel(true)).toBe('Hesabım')
    expect(accountLinkLabel(false, 'en')).toBe('Sign in')
    expect(accountLinkLabel(true, 'en')).toBe('My account')
  })

  it('shows only for storefronts (a store slug is present)', () => {
    expect(shouldShowAccountLink('demo')).toBe(true)
    expect(shouldShowAccountLink(undefined)).toBe(false)
    expect(shouldShowAccountLink(null)).toBe(false)
    expect(shouldShowAccountLink('')).toBe(false)
  })
})

describe('store account link wiring', () => {
  const header = read('components/website-renderer/sections/website-header.tsx')

  it('header renders the link beside the cart CTA, gated on the store slug', () => {
    expect(header).toMatch(/shouldShowAccountLink\(cartSlug\)\s*\?\s*<StoreAccountLink/)
    expect(header.indexOf('<StoreAccountLink')).toBeLessThan(header.indexOf('data-header-cart'))
  })

  it('the account link is visible on mobile (icon) and labelled', () => {
    const link = read('components/website-renderer/store-account-link.tsx')
    expect(link).toContain('aria-label={label}')
    expect(link).toContain('hidden sm:inline')
    expect(link).not.toMatch(/hidden md:|max-md:hidden|hidden sm:flex/)
  })

  it('home, store, product and checkout all pass the store slug to the header', () => {
    expect(read('components/website-renderer/website-renderer.tsx')).toContain('cartSlug={store?.slug}')
    expect(read('components/store/store-site-shell.tsx')).toContain('storeSlug={slug}')
  })

  it('non-store renders pass no store slug, so no link', () => {
    const renderer = read('components/website-renderer/website-renderer.tsx')
    expect(renderer).toMatch(/store\s*=\s*null/)
  })

  it('session endpoint returns only a boolean', () => {
    const route = read('app/api/store/session/route.ts')
    expect(route).toContain('loggedIn')
    expect(route).not.toMatch(/NextResponse\.json\(\s*customer/)
  })
})
