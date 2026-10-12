'use client'

import { PackageOpen } from 'lucide-react'
import type { StoreProduct } from '@/lib/store'
import { ProductCard } from './product-card'
import type { ShippingSettings } from '@/lib/store-shipping-rules'

type StoreFrontProps = {
  slug: string
  storeName: string
  products: StoreProduct[]
  shipping?: ShippingSettings
}

/**
 * Product list. The site header, cart drawer and footer come from
 * StoreSiteShell, so this page only renders its own heading and the grid.
 */
export function StoreFront({ slug, storeName, products }: StoreFrontProps) {
  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-8 font-display text-2xl font-bold sm:text-3xl">
          {storeName}
          <span className="sr-only"> - Ürünler</span>
        </h1>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
            <PackageOpen className="size-10 text-muted-foreground" aria-hidden />
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
      </div>
    </div>
  )
}
