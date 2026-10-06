'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Plus, Minus, Trash2, X, ArrowLeft, PackageOpen, AlertCircle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CartProvider, useCart, useAddWithConfirm, formatPrice, type CartItem } from './cart-provider'
import type { StoreProduct } from '@/lib/store'

type StoreFrontProps = {
  slug: string
  storeName: string
  products: StoreProduct[]
}

export function StoreFront(props: StoreFrontProps) {
  return (
    <CartProvider slug={props.slug}>
      <StoreFrontInner {...props} />
    </CartProvider>
  )
}

function StoreFrontInner({ slug, storeName, products }: StoreFrontProps) {
  const cart = useCart()
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/site/${slug}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{storeName}</span>
            </Link>
          </div>
          <h1 className="font-display text-lg font-bold">Mağaza</h1>
          <div className="flex items-center gap-2">
            <Link
              href={`/site/${slug}/hesap`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              aria-label="Hesabım"
            >
              <User className="size-4" />
              <span className="hidden sm:inline">Hesap</span>
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
              aria-label="Sepeti aç"
            >
              <ShoppingCart className="size-4" />
              <span className="hidden sm:inline">Sepet</span>
              {cart.count > 0 && (
                <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {cart.count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
            <PackageOpen className="size-10 text-muted-foreground" />
            <p className="text-lg font-medium">Bu mağazada henüz ürün yok.</p>
            <p className="text-sm text-muted-foreground">Yakında tekrar kontrol et.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.id} slug={slug} product={p} />
            ))}
          </div>
        )}
      </main>

      <CartDrawer slug={slug} open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}

function ProductCard({ slug, product }: { slug: string; product: StoreProduct }) {
  const cart = useCart()
  const { requestAdd, pending, confirm, cancel } = useAddWithConfirm(cart)
  const image = product.images[0] ?? null
  const outOfStock = product.stock <= 0

  const cartItem: Omit<CartItem, 'quantity'> = {
    productId: product.id,
    name: product.name,
    priceCents: product.price_cents,
    currency: product.currency,
    image,
    maxStock: product.stock,
  }

  return (
    <>
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg">
      <Link
        href={`/site/${slug}/store/${product.slug}`}
        className="relative aspect-square overflow-hidden bg-muted"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image || '/placeholder.svg'}
            alt={product.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <PackageOpen className="size-10" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link href={`/site/${slug}/store/${product.slug}`}>
          <h3 className="line-clamp-1 font-medium hover:underline">{product.name}</h3>
        </Link>
        {product.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="font-display text-lg font-bold">
            {formatPrice(product.price_cents, product.currency)}
          </span>
          <Button
            size="sm"
            disabled={outOfStock}
            onClick={() => requestAdd(cartItem, 1)}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            {outOfStock ? 'Tükendi' : 'Ekle'}
          </Button>
        </div>
      </div>
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
                {'"' + product.name + '" sepetinizde bulunuyor. Bir adet daha eklensin mi?'}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" onClick={cancel}>
              Vazgeç
            </Button>
            <Button size="sm" onClick={confirm}>
              Evet, ekle
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function CartDrawer({
  slug,
  open,
  onClose,
}: {
  slug: string
  open: boolean
  onClose: () => void
}) {
  const cart = useCart()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-bold">Sepetim ({cart.count})</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Kapat"
          >
            <X className="size-5" />
          </button>
        </div>

        {cart.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <ShoppingCart className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Sepetin boş.</p>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
              {cart.items.map((item) => (
                <li key={item.productId} className="flex gap-3 py-4">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image || '/placeholder.svg'}
                        alt={item.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <PackageOpen className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="line-clamp-1 text-sm font-medium">{item.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatPrice(item.priceCents, item.currency)}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-border">
                        <button
                          type="button"
                          onClick={() => cart.setQty(item.productId, item.quantity - 1)}
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          aria-label="Azalt"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => cart.setQty(item.productId, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                          aria-label="Artır"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(item.productId)}
                        className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label="Kaldır"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-muted-foreground">Ara toplam</span>
                <span className="font-display text-lg font-bold">
                  {formatPrice(cart.subtotalCents, cart.currency)}
                </span>
              </div>
              <Link href={`/site/${slug}/checkout`} onClick={onClose}>
                <Button className="w-full" size="lg">
                  Ödemeye geç
                </Button>
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
