'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Minus, Plus, ShoppingCart, PackageOpen, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CartProvider, useCart, useAddWithConfirm, formatPrice } from './cart-provider'
import { TryOnButton } from './try-on-button'
import type { StoreProduct } from '@/lib/store'

export function ProductDetail({
  slug,
  storeName,
  product,
  enableTryOn = false,
}: {
  slug: string
  storeName: string
  product: StoreProduct
  enableTryOn?: boolean
}) {
  return (
    <CartProvider slug={slug}>
      <ProductDetailInner slug={slug} storeName={storeName} product={product} enableTryOn={enableTryOn} />
    </CartProvider>
  )
}

function ProductDetailInner({
  slug,
  storeName,
  product,
  enableTryOn,
}: {
  slug: string
  storeName: string
  product: StoreProduct
  enableTryOn: boolean
}) {
  const cart = useCart()
  const { requestAdd, pending, confirm, cancel } = useAddWithConfirm(cart)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const image = product.images[0] ?? null
  const outOfStock = product.stock <= 0

  function flashAdded() {
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  function handleAdd() {
    const alreadyIn = cart.items.some((i) => i.productId === product.id)
    requestAdd(
      {
        productId: product.id,
        name: product.name,
        priceCents: product.price_cents,
        currency: product.currency,
        image,
        maxStock: product.stock,
      },
      qty,
    )
    if (!alreadyIn) flashAdded()
  }

  return (
    <>
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link
            href={`/site/${slug}/store`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Mağaza
          </Link>
          <Link
            href={`/site/${slug}/store`}
            className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ShoppingCart className="size-4" />
            {cart.count > 0 && (
              <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {cart.count}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image || '/placeholder.svg'} alt={product.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <PackageOpen className="size-16" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="font-display text-3xl font-bold text-balance">{product.name}</h1>
          <span className="font-display text-2xl font-bold">
            {formatPrice(product.price_cents, product.currency)}
          </span>
          {product.description && (
            <p className="leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          <div className="text-sm text-muted-foreground">
            {outOfStock ? (
              <span className="text-destructive">Stokta yok</span>
            ) : (
              <span>Stokta {product.stock} adet</span>
            )}
          </div>

          {!outOfStock && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Azalt"
                >
                  <Minus className="size-4" />
                </button>
                <span className="min-w-10 text-center font-medium">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                  disabled={qty >= product.stock}
                  className="p-2.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  aria-label="Artır"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <Button size="lg" onClick={handleAdd} className="flex-1 gap-2">
                {added ? (
                  <>
                    <Check className="size-4" />
                    Sepete eklendi
                  </>
                ) : (
                  <>
                    <ShoppingCart className="size-4" />
                    Sepete ekle
                  </>
                )}
              </Button>
            </div>
          )}

          {enableTryOn && image && (
            <TryOnButton
              productImage={image}
              productName={product.name}
              target={{ mode: 'store', storeSlug: slug }}
            />
          )}
        </div>
      </main>
    </div>

    {pending !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={cancel} aria-hidden="true" />
        <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <AlertCircle className="size-5" />
            </span>
            <div className="flex-1">
              <h2 className="font-display text-base font-bold">Ürün zaten sepetinizde</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {'"' + product.name + '" sepetinizde bulunuyor. ' + qty + ' adet daha eklensin mi?'}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>
              Vazgeç
            </Button>
            <Button
              size="sm"
              onClick={() => {
                confirm()
                flashAdded()
              }}
            >
              Evet, ekle
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
