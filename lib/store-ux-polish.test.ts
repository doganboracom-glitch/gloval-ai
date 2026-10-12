import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { galleryView, stepGalleryIndex } from './product-gallery-view'
import {
  cartAddOutcome,
  cartToastMessage,
  clampCartQty,
  shouldAddForBuyNow,
} from './store-cart-feedback'
import {
  isCartCta,
  isProductsLink,
  accountLinkLabel,
  normalizeSessionPayload,
  resolveViewAllLabel,
  shouldShowAccountLink,
  storeCheckoutHref,
  storeListHref,
} from './store-header-links'
import {
  authenticateSessionToken,
  makeToken,
  parseToken,
  sessionVersion,
} from './store-session-token'

const root = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('cart feedback', () => {
  it('reports a new line as added and a repeat as updated', () => {
    expect(cartAddOutcome([], 'a', 1, 10)).toEqual({ kind: 'added', quantity: 1 })
    expect(cartAddOutcome([{ productId: 'a', quantity: 2 }], 'a', 1, 10)).toEqual({
      kind: 'updated',
      quantity: 3,
    })
  })

  it('never exceeds stock or the 99 cap', () => {
    expect(clampCartQty(500, 0)).toBe(99)
    expect(clampCartQty(5, 3)).toBe(3)
    expect(clampCartQty(0, 3)).toBe(1)
    expect(cartAddOutcome([{ productId: 'a', quantity: 3 }], 'a', 5, 4).quantity).toBe(4)
  })

  it('words the toast in Turkish and English', () => {
    expect(cartToastMessage({ kind: 'added', quantity: 1 })).toBe('Sepete eklendi')
    expect(cartToastMessage({ kind: 'updated', quantity: 3 })).toContain('3 adet')
    expect(cartToastMessage({ kind: 'added', quantity: 1 }, 'en')).toBe('Added to cart')
  })

  it('buy-now does not double add an item already in the cart', () => {
    expect(shouldAddForBuyNow([{ productId: 'a' }], 'a')).toBe(false)
    expect(shouldAddForBuyNow([], 'a')).toBe(true)
  })
})

describe('header links', () => {
  it('builds tenant-relative store hrefs', () => {
    expect(storeListHref('demo')).toBe('/site/demo/store')
    expect(storeCheckoutHref('demo')).toBe('/site/demo/checkout')
  })

  it('shows the account link only on storefronts and labels it by session', () => {
    expect(shouldShowAccountLink('demo')).toBe(true)
    expect(shouldShowAccountLink(undefined)).toBe(false)
    expect(accountLinkLabel(false)).toBe('Giriş yap')
    expect(accountLinkLabel(true)).toBe('Hesabım')
    expect(accountLinkLabel(true, 'en')).toBe('My account')
  })

  it('treats anything but an explicit loggedIn:true as signed out', () => {
    expect(normalizeSessionPayload({ loggedIn: true })).toEqual({ loggedIn: true })
    expect(normalizeSessionPayload({ loggedIn: 'yes' })).toEqual({ loggedIn: false })
    expect(normalizeSessionPayload(null)).toEqual({ loggedIn: false })
  })

  it('header cart button opens the drawer instead of navigating to checkout', () => {
    const src = read('components/website-renderer/sections/website-header.tsx')
    expect(src).toContain('requestOpenCart()')
    expect(src).not.toContain('storeCartHref')
    expect(src).toContain('--site-header-h')
  })

  it('detects cart CTAs and product links', () => {
    expect(isCartCta({ label: 'Sepetim' })).toBe(true)
    expect(isCartCta({ label: 'Go', href: '/site/x/checkout' })).toBe(true)
    expect(isCartCta({ label: 'İletişim', href: '/contact' })).toBe(false)
    expect(isProductsLink('Ürünler')).toBe(true)
    expect(isProductsLink('Tara', '/site/x/store')).toBe(true)
    expect(isProductsLink('Hakkımızda', '#about')).toBe(false)
  })

  it('treats an empty view-all label as hidden and unset as default', () => {
    expect(resolveViewAllLabel(undefined)).toBe('Tüm ürünleri gör')
    expect(resolveViewAllLabel('  ')).toBeNull()
    expect(resolveViewAllLabel('Hepsi')).toBe('Hepsi')
  })
})

describe('store customer session token', () => {
  process.env.STORE_CUSTOMER_AUTH_SECRET = 'test-secret'
  const row = { password_changed_at: '2024-01-01T00:00:00.000Z' }
  const find = async () => row

  it('accepts a token issued for the project with the current password version', async () => {
    const token = makeToken('c1', 'p1', sessionVersion(row))
    expect(parseToken(token)).toMatchObject({ customerId: 'c1', projectId: 'p1' })
    expect(await authenticateSessionToken(token, 'p1', find)).toBe(row)
  })

  it('rejects other projects, stale versions, tampering and missing tokens', async () => {
    const token = makeToken('c1', 'p1', sessionVersion(row))
    expect(await authenticateSessionToken(token, 'p2', find)).toBeNull()
    expect(await authenticateSessionToken(makeToken('c1', 'p1', 1), 'p1', find)).toBeNull()
    expect(await authenticateSessionToken(`${token}x`, 'p1', find)).toBeNull()
    expect(await authenticateSessionToken(undefined, 'p1', find)).toBeNull()
    expect(await authenticateSessionToken(token, 'p1', async () => null)).toBeNull()
  })
})

describe('product gallery view', () => {
  it('hides strip, arrows and counter for one image', () => {
    expect(galleryView(1, 0)).toEqual({ count: 1, showStrip: false, showArrows: false, counter: null })
    expect(galleryView(0, 0).counter).toBeNull()
  })

  it('shows a counter and caps at 8 images', () => {
    expect(galleryView(3, 1).counter).toBe('2 / 3')
    expect(galleryView(12, 20)).toMatchObject({ count: 8, counter: '8 / 8' })
  })

  it('wraps around when stepping', () => {
    expect(stepGalleryIndex(0, -1, 3)).toBe(2)
    expect(stepGalleryIndex(2, 1, 3)).toBe(0)
    expect(stepGalleryIndex(0, 1, 1)).toBe(0)
  })
})

describe('storefront styling contracts', () => {
  const css = read('app/globals.css')

  it('remaps generic tokens to the site theme only inside the storefront root', () => {
    expect(css).toMatch(/\[data-storefront-root\]\s*\{[^}]*--primary:\s*var\(--site-primary\)/)
    expect(css).toMatch(/\[data-storefront-root\]\s*\{[^}]*--border:\s*var\(--site-border\)/)
  })

  it('gives interactive storefront controls a pointer cursor', () => {
    expect(css).toMatch(/\[data-storefront-root\][\s\S]*?cursor:\s*pointer/)
    expect(css).toMatch(/\[data-storefront-root\][\s\S]*?cursor:\s*not-allowed/)
  })

  it('checkout shows the summary once per breakpoint and keeps card sections', () => {
    const src = read('components/store/checkout-form.tsx')
    expect(src).toContain('md:hidden')
    expect(src).toContain('md:sticky')
    expect(src).toContain('OrderSummaryBody')
    expect(src).not.toMatch(/text-white|bg-white|bg-black/)
  })
})
