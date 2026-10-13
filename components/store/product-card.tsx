'use client'

import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { ProductImagePlaceholder } from '@/components/store/product-image-placeholder'
import { onSiteNavClick } from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import { SiteConfirmDialog } from '@/components/website-renderer/site-confirm-dialog'
import {
  formatPrice,
  requestOpenCart,
  useAddWithConfirm,
  useOptionalCart,
  type CartItem,
} from '@/components/store/cart-provider'
import type { StoreProduct } from '@/lib/store'
import { discountPercent } from '@/lib/store-product-display'
import { getStockNotice, isSoldOut, purchasableMax } from '@/lib/store-stock'
import {
  HOVER_GALLERY_INTERVAL_MS,
  canPlayHoverGallery,
  nextGalleryIndex,
} from '@/lib/product-card-gallery'

/**
 * Reads the two media queries that gate hover playback. Touch devices and
 * `prefers-reduced-motion` users never get auto-cycling images.
 */
function useHoverGalleryAllowed(imageCount: number): boolean {
  const [env, setEnv] = useState({ hoverCapable: false, reducedMotion: true })

  useEffect(() => {
    if (imageCount < 2) return
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => setEnv({ hoverCapable: hover.matches, reducedMotion: reduced.matches })
    read()
    hover.addEventListener('change', read)
    reduced.addEventListener('change', read)
    return () => {
      hover.removeEventListener('change', read)
      reduced.removeEventListener('change', read)
    }
  }, [imageCount])

  return canPlayHoverGallery({ imageCount, ...env })
}

export type ProductCardProps = {
  product: StoreProduct
  /** Store (site) slug; builds the product page link. */
  slug: string
  /** Optional category label shown above the name. */
  categoryName?: string | null
}

/**
 * The single product card used by the store list page and by the home-page
 * product showcase. Colors read the scoped `--site-*` theme variables when
 * present (generated site) and fall back to the app tokens (store page).
 */
export function ProductCard({ product, slug, categoryName }: ProductCardProps) {
  const nav = useSiteNav()
  const cart = useOptionalCart()
  const { requestAdd } = useAddWithConfirm(cart)
  const [added, setAdded] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [activated, setActivated] = useState(false)
  const [index, setIndex] = useState(0)

  const images = product.images
  const cover = images[0] ?? null
  const galleryAllowed = useHoverGalleryAllowed(images.length)
  const playing = galleryAllowed && hovering

  useEffect(() => {
    if (!playing) {
      setIndex(0)
      return
    }
    const id = window.setInterval(
      () => setIndex((i) => nextGalleryIndex(i, images.length)),
      HOVER_GALLERY_INTERVAL_MS,
    )
    return () => window.clearInterval(id)
  }, [playing, images.length])

  const href = `/site/${slug}/store/${product.slug}`
  const outOfStock = isSoldOut(product)
  const stockNotice = getStockNotice(product)
  const discount = discountPercent(product.price_cents, product.compare_at_price_cents)
  const canAdd = !!cart && !outOfStock

  const cartItem: Omit<CartItem, 'quantity'> = {
    productId: product.id,
    name: product.name,
    priceCents: product.price_cents,
    currency: product.currency,
    image: cover?.url ?? null,
    maxStock: purchasableMax(product),
  }

  function flashAdded() {
    setAdded(true)
    requestOpenCart()
    window.setTimeout(() => setAdded(false), 1400)
  }

  function handleAdd() {
    if (!cart) return
    const alreadyIn = cart.items.some((i) => i.productId === product.id)
    requestAdd(cartItem, 1)
    if (!alreadyIn) flashAdded()
  }

  const open = (e: React.MouseEvent<HTMLAnchorElement>) => onSiteNavClick(e, href, nav)

  return (
    <>
      <article
        data-product-card
        onMouseEnter={() => {
          setHovering(true)
          setActivated(true)
        }}
        onMouseLeave={() => setHovering(false)}
        className="group flex h-full flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1"
        style={{
          borderRadius: 'var(--site-radius, 1rem)',
          border: '1px solid var(--site-border, var(--border))',
          backgroundColor: 'var(--site-card, var(--card))',
          color: 'var(--site-fg, var(--foreground))',
        }}
      >
        <a
          href={href}
          onClick={open}
          aria-label={product.name}
          className="relative block aspect-square overflow-hidden"
          style={{ backgroundColor: 'var(--site-muted, var(--muted))' }}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.url}
              alt={cover.alt || product.name}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <ProductImagePlaceholder name={product.name} />
          )}
          {galleryAllowed && activated
            ? images.slice(1).map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.url}
                  src={img.url}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  decoding="async"
                  data-gallery-image
                  className="absolute inset-0 size-full object-cover transition-opacity duration-500 ease-in-out"
                  style={{ opacity: playing && index === i + 1 ? 1 : 0 }}
                />
              ))
            : null}
          {discount !== null && (
            <span className="absolute left-3 top-3 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-white">
              %{discount}
            </span>
          )}
          {outOfStock && (
            <span className="absolute right-3 top-3 rounded-full bg-foreground/85 px-2.5 py-1 text-xs font-semibold text-background">
              Tükendi
            </span>
          )}
        </a>

        <div className="flex flex-1 flex-col p-4">
          {categoryName ? (
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--site-muted-fg, var(--muted-foreground))' }}
            >
              {categoryName}
            </span>
          ) : null}
          <a href={href} onClick={open} className="mt-1" style={{ textDecoration: 'none' }}>
            <h3
              className="text-pretty text-sm font-semibold leading-snug transition-opacity hover:opacity-80 sm:text-base"
              style={{ fontFamily: 'var(--site-heading-font, inherit)' }}
            >
              {product.name}
            </h3>
          </a>
          {stockNotice?.kind === 'low' && (
            <p className="mt-1 text-xs font-medium text-amber-600">{stockNotice.text}</p>
          )}

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-base font-bold">{formatPrice(product.price_cents, product.currency)}</span>
            {discount !== null && product.compare_at_price_cents != null && (
              <span
                className="text-xs line-through"
                style={{ color: 'var(--site-muted-fg, var(--muted-foreground))' }}
              >
                {formatPrice(product.compare_at_price_cents, product.currency)}
              </span>
            )}
          </div>

          {canAdd || outOfStock ? (
            <button
              type="button"
              disabled={outOfStock}
              onClick={handleAdd}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderRadius: 'var(--site-radius, 0.75rem)',
                fontFamily: 'var(--site-body-font, inherit)',
                backgroundColor: 'var(--site-primary, var(--primary))',
                color: 'var(--site-primary-fg, var(--primary-foreground))',
              }}
            >
              <ShoppingCart className="size-3.5" aria-hidden />
              {outOfStock ? 'Tükendi' : added ? 'Sepete eklendi' : 'Sepete Ekle'}
            </button>
          ) : (
            <a
              href={href}
              onClick={open}
              className="mt-4 inline-flex items-center justify-center px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{
                borderRadius: 'var(--site-radius, 0.75rem)',
                fontFamily: 'var(--site-body-font, inherit)',
                backgroundColor: 'var(--site-primary, var(--primary))',
                color: 'var(--site-primary-fg, var(--primary-foreground))',
              }}
            >
              İncele
            </a>
          )}
        </div>
      </article>


    </>
  )
}
