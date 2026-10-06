'use client'

import { useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  SiteImage,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import {
  useOptionalCart,
  useAddWithConfirm,
  inferCurrency,
  parsePriceToCents,
  requestOpenCart,
} from '@/components/store/cart-provider'
import {
  useStoreCatalog,
  resolveCatalogEntry,
} from '@/components/website-renderer/store-catalog-context'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import { SiteConfirmDialog } from '@/components/website-renderer/site-confirm-dialog'

type ProductsData = Extract<Section, { type: 'products' }>
type ProductItem = ProductsData['items'][number]

/** Derives a stable product id from the item's detail href or its name. */
function productIdFor(item: ProductItem): string {
  const href = (item.href || '').trim()
  if (href.startsWith('/')) {
    const last = href.split('?')[0].split('/').filter(Boolean).pop()
    if (last && last !== 'products') return last
  }
  return item.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Product showcase. Renders real store cards — image, corner badge, category,
 * name, price (with optional struck old price) and an action button — either as
 * a wrapped grid (default) or a horizontally scrolling carousel row that
 * collapses to a clean grid on desktop so it never overflows the page. Colors,
 * radius and fonts all read from the scoped `--site-*` theme variables.
 */
export function ProductsSection({ data }: { data: ProductsData }) {
  const carousel = data.layout === 'carousel'

  return (
    <SectionShell id="products">
      <SectionHeading title={data.title} subtitle={data.subtitle} />

      {carousel ? (
        // Mobile: contained horizontal snap-scroll (bleeds to the section
        // padding edges). Desktop: a 4-up grid that fits exactly, so no
        // horizontal scrollbar ever leaks onto the page.
        <div
          className="mt-10 flex gap-5 overflow-x-auto overscroll-x-contain pb-4 snap-x snap-mandatory [scrollbar-width:thin] lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible"
        >
          {data.items.map((item, i) => (
            <div
              key={i}
              className="w-60 shrink-0 snap-start sm:w-64 lg:w-auto"
            >
              <ProductCard item={item} seed={i + 1} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {data.items.map((item, i) => (
            <ProductCard key={i} item={item} seed={i + 1} />
          ))}
        </div>
      )}
    </SectionShell>
  )
}

function ProductCard({ item, seed }: { item: ProductItem; seed: number }) {
  const nav = useSiteNav()
  const cart = useOptionalCart()
  const catalog = useStoreCatalog()
  // On a published storefront this resolves the card to its REAL database
  // product, so add-to-cart carries the true product id/price/stock into the
  // existing checkout and the card links to the live detail page.
  const entry = resolveCatalogEntry(catalog, item.name)
  const { requestAdd, pending, confirm, cancel } = useAddWithConfirm(cart)
  const [added, setAdded] = useState(false)

  // Prefer the real product detail route; fall back to the schema's own href.
  const detailHref =
    entry && catalog
      ? `/site/${catalog.slug}/store/${entry.slug}`
      : (item.href || '').trim()
  const isDetailLink = detailHref.startsWith('/')

  // The cart id MUST be the DB product id for a real store; otherwise checkout
  // (which looks products up by id) can't find it. Falls back to the derived id
  // in demo/marketing contexts that have no catalog.
  const productId = entry ? entry.id : productIdFor(item)

  // In a real store, only offer add-to-cart for products that actually resolved
  // to a catalog row (so we never add an un-checkoutable line). Demo/marketing
  // carts (no catalog) keep working exactly as before.
  const canAddToCart = !!cart && (!!entry || !catalog)

  function flashAdded() {
    setAdded(true)
    requestOpenCart()
    window.setTimeout(() => setAdded(false), 1400)
  }

  function handleAddToCart() {
    if (!cart) return
    const alreadyIn = cart.items.some((i) => i.productId === productId)
    requestAdd({
      productId,
      name: item.name,
      priceCents: entry ? entry.priceCents : parsePriceToCents(item.price),
      currency: entry ? entry.currency : inferCurrency(item.price),
      image: entry?.image ?? item.src ?? null,
      maxStock: entry ? Math.max(1, entry.stock) : 99,
    })
    // Fresh adds apply immediately; duplicates wait for dialog confirmation.
    if (!alreadyIn) flashAdded()
  }

  // Media + title link to the detail page when the item points at a real route.
  const Media = (
    <div className="relative">
      <SiteImage
        image={{
          imagePrompt: item.imagePrompt,
          src: item.src,
          alt: item.alt ?? item.name,
          aspectRatio: '1/1',
        }}
        seed={seed}
        rounded={false}
        className="w-full"
      />
      {item.badge ? (
        <span
          className="absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--site-primary)',
            color: 'var(--site-primary-fg)',
          }}
        >
          {item.badge}
        </span>
      ) : null}
    </div>
  )

  return (
    <>
    <article
      className="group flex h-full flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1"
      style={{
        borderRadius: 'var(--site-radius)',
        border: '1px solid var(--site-border)',
        backgroundColor: 'var(--site-card)',
      }}
    >
      {isDetailLink ? (
        <a href={detailHref} onClick={(e) => onSiteNavClick(e, detailHref, nav)} aria-label={item.name}>
          {Media}
        </a>
      ) : (
        Media
      )}

      <div className="flex flex-1 flex-col p-4">
        {item.category ? (
          <span
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            {item.category}
          </span>
        ) : null}

        {isDetailLink ? (
          <a
            href={detailHref}
            onClick={(e) => onSiteNavClick(e, detailHref, nav)}
            className="mt-1"
            style={{ textDecoration: 'none' }}
          >
            <h3
              className="text-pretty text-sm font-semibold leading-snug transition-opacity hover:opacity-80 sm:text-base"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {item.name}
            </h3>
          </a>
        ) : (
          <h3
            className="mt-1 text-pretty text-sm font-semibold leading-snug sm:text-base"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {item.name}
          </h3>
        )}

        {item.description ? (
          <p className="mt-1 line-clamp-2 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
            {item.description}
          </p>
        ) : null}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-base font-bold" style={{ color: 'var(--site-fg)' }}>
            {item.price}
          </span>
          {item.oldPrice ? (
            <span className="text-xs line-through" style={{ color: 'var(--site-muted-fg)' }}>
              {item.oldPrice}
            </span>
          ) : null}
        </div>

        {/* When a cart exists (real or demo store), the primary action adds to
            the cart in place; otherwise it's a link to the detail/anchor.
            In a store the button ALWAYS reads "Sepete Ekle" — the catalog's
            buttonText (e.g. "İncele") is meant for the non-commerce link case,
            and reusing it here made an add-to-cart button look like a detail
            link, so buyers clicked it expecting to open the product page. */}
        {canAddToCart ? (
          <button
            type="button"
            onClick={handleAddToCart}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
              borderRadius: 'var(--site-radius)',
              fontFamily: 'var(--site-body-font)',
              backgroundColor: 'var(--site-primary)',
              color: 'var(--site-primary-fg)',
            }}
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            {added ? 'Sepete eklendi ✓' : 'Sepete Ekle'}
          </button>
        ) : (
          <a
            href={isDetailLink ? detailHref : item.href || '#'}
            onClick={(e) => onSiteNavClick(e, isDetailLink ? detailHref : item.href, nav)}
            className="mt-4 inline-flex items-center justify-center px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
              borderRadius: 'var(--site-radius)',
              fontFamily: 'var(--site-body-font)',
              backgroundColor: 'var(--site-primary)',
              color: 'var(--site-primary-fg)',
            }}
          >
            {item.buttonText || 'İncele'}
          </a>
        )}
      </div>
    </article>

    <SiteConfirmDialog
      open={pending !== null}
      title="Ürün zaten sepetinizde"
      description={`"${item.name}" sepetinizde bulunuyor. Bir adet daha eklensin mi?`}
      confirmLabel="Evet, ekle"
      cancelLabel="Vazgeç"
      onConfirm={() => {
        confirm()
        flashAdded()
      }}
      onCancel={cancel}
    />
    </>
  )
}
