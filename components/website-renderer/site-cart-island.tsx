'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart, Plus, Minus, Trash2, X, PackageOpen, Check } from 'lucide-react'
import {
  useCart,
  formatPrice,
  OPEN_CART_EVENT,
  CART_TOAST_EVENT,
  type CartToastDetail,
} from '@/components/store/cart-provider'
import { CART_TOAST_DURATION_MS, cartToastMessage } from '@/lib/store-cart-feedback'
import { DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from '@/lib/store-shipping-rules'
import { SHIPPING_COPY, buildShippingView, cartTotalCents } from '@/lib/store-shipping-display'

/**
 * Self-contained cart control for a GENERATED storefront. It is mounted by the
 * renderer only when the published site has a real catalog, and lives entirely
 * inside the site's `--site-*` theme so it matches the generated design rather
 * than the platform's admin theme.
 *
 * It intentionally sits at the top-right: the bottom-left is reserved for the
 * phone/WhatsApp buttons and the bottom-right for BackToTop + the Gloval
 * credit. It opens automatically when a product card dispatches the shared
 * "open cart" event after an add, and links to the existing checkout route.
 */
export function SiteCartIsland({
  slug,
  lang,
  shipping = DEFAULT_SHIPPING_SETTINGS,
}: {
  slug: string
  lang: 'tr' | 'en'
  shipping?: ShippingSettings
}) {
  const cart = useCart()
  const [open, setOpen] = useState(false)
  const shippingView = buildShippingView(cart.subtotalCents, shipping, lang)
  const showShipping = shipping.feeCents > 0

  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    const openCart = () => setOpen(true)
    window.addEventListener(OPEN_CART_EVENT, openCart)
    return () => window.removeEventListener(OPEN_CART_EVENT, openCart)
  }, [])

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<CartToastDetail>).detail
      if (!detail) return
      setToast({ id: Date.now(), message: cartToastMessage(detail, lang) })
    }
    window.addEventListener(CART_TOAST_EVENT, onToast)
    return () => window.removeEventListener(CART_TOAST_EVENT, onToast)
  }, [lang])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), CART_TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const t =
    lang === 'en'
      ? {
          goToCart: 'Go to cart',
          openCart: 'Open cart',
          cart: 'Cart',
          empty: 'Your cart is empty.',
          subtotal: 'Subtotal',
          total: 'Total',
          checkout: 'Checkout',
          close: 'Close',
          decrease: 'Decrease',
          increase: 'Increase',
          remove: 'Remove',
        }
      : {
          goToCart: 'Sepete git',
          openCart: 'Sepeti aç',
          cart: 'Sepetim',
          empty: 'Sepetin boş.',
          subtotal: 'Ara toplam',
          total: 'Toplam',
          checkout: 'Ödemeye geç',
          close: 'Kapat',
          decrease: 'Azalt',
          increase: 'Artır',
          remove: 'Kaldır',
        }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.openCart}
        className="fixed right-4 top-20 z-40 inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold shadow-lg transition-transform hover:-translate-y-0.5"
        style={{
          borderRadius: 'var(--site-radius)',
          backgroundColor: 'var(--site-primary)',
          color: 'var(--site-primary-fg)',
        }}
      >
        <ShoppingCart className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t.cart}</span>
        {cart.count > 0 && (
          <span
            className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold"
            style={{ backgroundColor: 'var(--site-bg)', color: 'var(--site-fg)' }}
          >
            {cart.count}
          </span>
        )}
      </button>

      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-3 bottom-24 z-[60] flex justify-center sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-36 sm:justify-end">
        {toast && (
          <div
            key={toast.id}
            data-cart-toast
            className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 px-4 py-3 text-sm shadow-xl sm:w-auto sm:min-w-72"
            style={{
              borderRadius: 'var(--site-radius)',
              backgroundColor: 'var(--site-card)',
              color: 'var(--site-fg)',
              border: '1px solid var(--site-border)',
            }}
          >
            <span className="flex items-center gap-2 font-medium">
              <Check className="size-4 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden />
              {toast.message}
            </span>
            <a
              href={`/site/${slug}/checkout`}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{
                borderRadius: 'var(--site-radius)',
                backgroundColor: 'var(--site-primary)',
                color: 'var(--site-primary-fg)',
              }}
            >
              {t.goToCart}
            </a>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col shadow-2xl"
            style={{ backgroundColor: 'var(--site-card)', color: 'var(--site-fg)' }}
            role="dialog"
            aria-modal="true"
            aria-label={t.cart}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--site-border)' }}
            >
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>
                {t.cart} ({cart.count})
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 transition-opacity hover:opacity-70"
                style={{ color: 'var(--site-muted-fg)' }}
                aria-label={t.close}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cart.items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <ShoppingCart className="h-10 w-10" style={{ color: 'var(--site-muted-fg)' }} />
                <p style={{ color: 'var(--site-muted-fg)' }}>{t.empty}</p>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y overflow-y-auto px-5" style={{ borderColor: 'var(--site-border)' }}>
                  {cart.items.map((item) => (
                    <li key={item.productId} className="flex gap-3 py-4">
                      <div
                        className="size-16 shrink-0 overflow-hidden"
                        style={{ borderRadius: 'var(--site-radius)', backgroundColor: 'var(--site-bg)' }}
                      >
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image || '/placeholder.svg'} alt={item.name} className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center" style={{ color: 'var(--site-muted-fg)' }}>
                            <PackageOpen className="size-6" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="line-clamp-1 text-sm font-medium">{item.name}</span>
                        <span className="text-sm" style={{ color: 'var(--site-muted-fg)' }}>
                          {formatPrice(item.priceCents, item.currency)}
                        </span>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex items-center" style={{ border: '1px solid var(--site-border)', borderRadius: 'var(--site-radius)' }}>
                            <button
                              type="button"
                              onClick={() => cart.setQty(item.productId, item.quantity - 1)}
                              className="p-1.5 transition-opacity hover:opacity-70"
                              style={{ color: 'var(--site-muted-fg)' }}
                              aria-label={t.decrease}
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => cart.setQty(item.productId, item.quantity + 1)}
                              disabled={item.quantity >= item.maxStock}
                              className="p-1.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                              style={{ color: 'var(--site-muted-fg)' }}
                              aria-label={t.increase}
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => cart.remove(item.productId)}
                            className="ml-auto rounded-lg p-1.5 transition-opacity hover:opacity-70"
                            style={{ color: 'var(--site-muted-fg)' }}
                            aria-label={t.remove}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="px-5 py-4" style={{ borderTop: '1px solid var(--site-border)' }}>
                  {showShipping && shippingView.hint && (
                    <div className="mb-3">
                      <p className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
                        {shippingView.hint}
                      </p>
                      {shippingView.progress !== null && (
                        <div
                          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                          style={{ backgroundColor: 'var(--site-border)' }}
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(shippingView.progress * 100)}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round(shippingView.progress * 100)}%`,
                              backgroundColor: 'var(--site-primary)',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {showShipping && (
                    <>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--site-muted-fg)' }}>{t.subtotal}</span>
                        <span>{formatPrice(cart.subtotalCents, cart.currency)}</span>
                      </div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span style={{ color: 'var(--site-muted-fg)' }}>{SHIPPING_COPY[lang].label}</span>
                        <span>
                          {shippingView.free
                            ? SHIPPING_COPY[lang].free
                            : formatPrice(shippingView.shippingCents, cart.currency)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="mb-3 flex items-center justify-between">
                    <span style={{ color: 'var(--site-muted-fg)' }}>{showShipping ? t.total : t.subtotal}</span>
                    <span className="text-lg font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>
                      {formatPrice(cartTotalCents(cart.subtotalCents, shipping), cart.currency)}
                    </span>
                  </div>
                  <a
                    href={`/site/${slug}/checkout`}
                    className="flex w-full items-center justify-center px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      borderRadius: 'var(--site-radius)',
                      backgroundColor: 'var(--site-primary)',
                      color: 'var(--site-primary-fg)',
                    }}
                  >
                    {t.checkout}
                  </a>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
