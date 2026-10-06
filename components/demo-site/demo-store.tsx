'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ShoppingCart, Plus, Minus, Trash2, X, User } from 'lucide-react'
import type { Lang } from '@/lib/i18n'
import { useDemoAccount } from '@/components/demo-site/use-demo-account'
import {
  CartProvider,
  useCart,
  useOptionalCart,
  useAddWithConfirm,
  formatPrice,
  parsePriceToCents,
  inferCurrency,
  requestOpenCart,
  OPEN_CART_EVENT,
} from '@/components/store/cart-provider'
import { SiteConfirmDialog } from '@/components/website-renderer/site-confirm-dialog'

/**
 * Demo store client pieces
 * -------------------------
 * A commerce demo (the homepage and every sub-route) is wrapped in a per-slug
 * `CartProvider` so the cart is persisted in localStorage and survives
 * navigation. These pieces are all themed from the demo's `--site-*` variables
 * so the cart matches the generated store. The shared `useOptionalCart` means
 * `DemoAddToCart` renders nothing when there is no cart in scope (e.g. a
 * non-commerce demo), keeping the component reusable.
 */

const t = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

export function DemoCartProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <CartProvider slug={slug}>{children}</CartProvider>
}

/* -------------------------------------------------------------------------- */
/*  Header cart button (opens the drawer via a shared event)                  */
/* -------------------------------------------------------------------------- */

export function DemoCartNavButton({ lang }: { lang: Lang }) {
  const cart = useOptionalCart()
  const count = cart?.count ?? 0
  return (
    <button
      type="button"
      onClick={() => requestOpenCart()}
      aria-label={t(lang, 'Sepeti aç', 'Open cart')}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-opacity hover:opacity-70"
      style={{ color: 'var(--site-fg)' }}
    >
      <ShoppingCart className="h-5 w-5" aria-hidden />
      {count > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Account nav button (login state + link to the account page)               */
/* -------------------------------------------------------------------------- */

export function DemoAccountNavButton({ slug, lang }: { slug: string; lang: Lang }) {
  const { profile, ready } = useDemoAccount(slug)
  const firstName = profile?.name?.trim().split(/\s+/)[0]
  const label = ready && firstName ? firstName : t(lang, 'Hesap', 'Account')
  return (
    <Link
      href={`/demo/${slug}/hesap?lang=${lang}`}
      aria-label={t(lang, 'Hesabım', 'My account')}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-70"
      style={{ color: 'var(--site-fg)' }}
    >
      <User className="h-5 w-5" aria-hidden />
      <span className="hidden max-w-24 truncate sm:inline">{label}</span>
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/*  Floating cart button + slide-over drawer                                  */
/* -------------------------------------------------------------------------- */

export function DemoCartIsland({ lang, checkoutHref }: { lang: Lang; checkoutHref: string }) {
  const cart = useCart()
  const [open, setOpen] = useState(false)

  // The header cart button and this floating button both open one drawer.
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_CART_EVENT, handler)
    return () => window.removeEventListener(OPEN_CART_EVENT, handler)
  }, [])

  return (
    <>
      {/* Floating button — stacked ABOVE the BackToTop control (bottom-right);
          bottom-left is reserved for the phone/WhatsApp actions. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(lang, 'Sepeti aç', 'Open cart')}
        className="fixed bottom-24 right-4 z-[9997] inline-flex h-12 w-12 items-center justify-center rounded-full shadow-lg outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 sm:bottom-28 sm:right-6 sm:h-14 sm:w-14"
        style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
      >
        <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        {cart.count > 0 ? (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
            style={{ backgroundColor: 'var(--site-fg)', color: 'var(--site-bg)' }}
          >
            {cart.count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[9999] flex justify-end" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col shadow-2xl"
            style={{ backgroundColor: 'var(--site-card)', color: 'var(--site-fg)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--site-border)' }}
            >
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>
                {t(lang, 'Sepetim', 'My Cart')} ({cart.count})
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 transition-opacity hover:opacity-70"
                style={{ color: 'var(--site-muted-fg)' }}
                aria-label={t(lang, 'Kapat', 'Close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cart.items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <ShoppingCart className="h-10 w-10" style={{ color: 'var(--site-muted-fg)' }} />
                <p style={{ color: 'var(--site-muted-fg)' }}>{t(lang, 'Sepetin boş.', 'Your cart is empty.')}</p>
              </div>
            ) : (
              <>
                <ul className="flex-1 overflow-y-auto px-5">
                  {cart.items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex gap-3 py-4"
                      style={{ borderBottom: '1px solid var(--site-border)' }}
                    >
                      <div
                        className="h-16 w-16 shrink-0 overflow-hidden rounded-lg"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--site-fg) 8%, transparent)' }}
                      >
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image || '/placeholder.svg'} alt={item.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="line-clamp-1 text-sm font-medium">{item.name}</span>
                        <span className="text-sm" style={{ color: 'var(--site-muted-fg)' }}>
                          {formatPrice(item.priceCents, item.currency)}
                        </span>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex items-center rounded-lg" style={{ border: '1px solid var(--site-border)' }}>
                            <button
                              type="button"
                              onClick={() => cart.setQty(item.productId, item.quantity - 1)}
                              className="p-1.5 transition-opacity hover:opacity-70"
                              style={{ color: 'var(--site-muted-fg)' }}
                              aria-label={t(lang, 'Azalt', 'Decrease')}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => cart.setQty(item.productId, item.quantity + 1)}
                              disabled={item.quantity >= item.maxStock}
                              className="p-1.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: 'var(--site-muted-fg)' }}
                              aria-label={t(lang, 'Artır', 'Increase')}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => cart.remove(item.productId)}
                            className="ml-auto rounded-lg p-1.5 transition-colors hover:text-red-500"
                            style={{ color: 'var(--site-muted-fg)' }}
                            aria-label={t(lang, 'Kaldır', 'Remove')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="px-5 py-4" style={{ borderTop: '1px solid var(--site-border)' }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span style={{ color: 'var(--site-muted-fg)' }}>{t(lang, 'Ara toplam', 'Subtotal')}</span>
                    <span className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>
                      {formatPrice(cart.subtotalCents, cart.currency)}
                    </span>
                  </div>
                  <Link
                    href={checkoutHref}
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-center px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      borderRadius: 'var(--site-radius)',
                      backgroundColor: 'var(--site-primary)',
                      color: 'var(--site-primary-fg)',
                    }}
                  >
                    {t(lang, 'Ödemeye geç', 'Checkout')}
                  </Link>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Product-detail add-to-cart (quantity + button)                            */
/* -------------------------------------------------------------------------- */

export function DemoAddToCart({
  id,
  name,
  priceDisplay,
  image,
  lang,
}: {
  id: string
  name: string
  priceDisplay?: string
  image: string | null
  lang: Lang
}) {
  const cart = useOptionalCart()
  const { requestAdd, pending, confirm, cancel } = useAddWithConfirm(cart)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  // Non-commerce demos have no cart provider — render nothing.
  if (!cart) return null

  function afterAdd() {
    setAdded(true)
    requestOpenCart()
    window.setTimeout(() => setAdded(false), 1600)
  }

  function handleAdd() {
    requestAdd(
      {
        productId: id,
        name,
        priceCents: parsePriceToCents(priceDisplay ?? ''),
        currency: inferCurrency(priceDisplay ?? ''),
        image,
        maxStock: 99,
      },
      qty,
    )
    // A duplicate defers to the confirm dialog; a fresh add lands immediately,
    // so only flash "added" when nothing is pending confirmation.
    if (!cart!.items.some((i) => i.productId === id)) afterAdd()
  }

  return (
    <>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-lg" style={{ border: '1px solid var(--site-border)' }}>
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="px-3 py-3 transition-opacity hover:opacity-70"
          style={{ color: 'var(--site-muted-fg)' }}
          aria-label={t(lang, 'Azalt', 'Decrease')}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-10 text-center text-sm font-medium">{qty}</span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(99, q + 1))}
          className="px-3 py-3 transition-opacity hover:opacity-70"
          style={{ color: 'var(--site-muted-fg)' }}
          aria-label={t(lang, 'Artır', 'Increase')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{
          borderRadius: 'var(--site-radius)',
          backgroundColor: 'var(--site-primary)',
          color: 'var(--site-primary-fg)',
        }}
      >
        <ShoppingCart className="h-4 w-4" aria-hidden />
        {added ? t(lang, 'Sepete eklendi ✓', 'Added ✓') : t(lang, 'Sepete Ekle', 'Add to Cart')}
      </button>
    </div>

    <SiteConfirmDialog
      open={pending !== null}
      title={t(lang, 'Ürün zaten sepetinizde', 'Already in your cart')}
      description={t(
        lang,
        `"${name}" sepetinizde bulunuyor. Bir adet daha eklensin mi?`,
        `"${name}" is already in your cart. Add one more?`,
      )}
      confirmLabel={t(lang, 'Evet, ekle', 'Yes, add')}
      cancelLabel={t(lang, 'Vazgeç', 'Cancel')}
      onConfirm={() => {
        confirm()
        afterAdd()
      }}
      onCancel={cancel}
    />
    </>
  )
}
