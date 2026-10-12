'use client'

import { useState } from 'react'
import { Check, Minus, Plus, ShoppingCart, Truck, MessageCircle } from 'lucide-react'
import { ProductGallery } from './product-gallery'
import { ProductCard } from './product-card'
import { discountPercent } from '@/lib/store-product-display'
import { Button } from '@/components/ui/button'
import { CartProvider, useCart, useAddWithConfirm, formatPrice } from './cart-provider'
import { TryOnButton } from './try-on-button'
import type { StoreProduct } from '@/lib/store'
import { getStockNotice, isSoldOut, purchasableMax } from '@/lib/store-stock'
import { DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from '@/lib/store-shipping-rules'
import { productShippingLine } from '@/lib/store-shipping-display'

type Props = { slug: string; storeName: string; product: StoreProduct; relatedProducts?: StoreProduct[]; enableTryOn?: boolean; shipping?: ShippingSettings; whatsapp?: { href: string; display: string } | null }

export function ProductDetail(props: Props) {
  return <CartProvider slug={props.slug}><ProductDetailInner {...props} /></CartProvider>
}

function ProductDetailInner({ slug, storeName, product, relatedProducts = [], enableTryOn = false, shipping = DEFAULT_SHIPPING_SETTINGS, whatsapp }: Props) {
  const cart = useCart()
  const { requestAdd, pending, confirm, cancel } = useAddWithConfirm(cart)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [tab, setTab] = useState<'description' | 'specs' | 'delivery'>('description')
  const image = product.images[0]?.url ?? null
  const outOfStock = isSoldOut(product)
  const maxQty = purchasableMax(product)
  const stockNotice = getStockNotice(product)
  const discount = discountPercent(product.price_cents, product.compare_at_price_cents)
  const specs = product.specs ?? []
  const flashAdded = () => { setAdded(true); window.setTimeout(() => setAdded(false), 1800) }
  const add = () => { const already = cart.items.some((i) => i.productId === product.id); requestAdd({ productId: product.id, name: product.name, priceCents: product.price_cents, currency: product.currency, image, maxStock: maxQty }, qty); if (!already) flashAdded() }
  const buyNow = () => { add(); window.location.href = `/site/${slug}/checkout` }

  return <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8">
    <nav aria-label="Kırıntı yolu" className="text-sm text-muted-foreground"><a href={`/site/${slug}`}>Ana sayfa</a><span aria-hidden> › </span><a href={`/site/${slug}/store`}>Ürünler</a><span aria-hidden> › </span><span>{product.name}</span></nav>
    <div className="grid gap-10 md:grid-cols-2">
      <ProductGallery images={product.images} name={product.name} />
      <section className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">{storeName}</p>
        <h1 className="text-balance text-3xl font-bold" style={{ fontFamily: 'var(--site-heading-font)' }}>{product.name}</h1>
        <div><div className="flex flex-wrap items-baseline gap-3"><span className="text-2xl font-bold">{formatPrice(product.price_cents, product.currency)}</span>{discount !== null && product.compare_at_price_cents != null && <><span className="text-base text-muted-foreground line-through">{formatPrice(product.compare_at_price_cents, product.currency)}</span><span className="rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">%{discount} indirim</span></>}</div><p className="text-xs text-muted-foreground">KDV dahil</p></div>
        {stockNotice && <p className={stockNotice.kind === 'sold_out' ? 'font-medium text-destructive' : 'font-medium text-amber-600'}>{stockNotice.text}</p>}
        {product.description && <p className="leading-relaxed text-muted-foreground">{product.description.split(/\n\s*\n/)[0]}</p>}
        {!outOfStock && <div className="flex flex-wrap gap-3"><div className="flex min-h-11 items-center rounded-lg border border-border"><button type="button" className="size-11" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Azalt"><Minus className="mx-auto size-4" /></button><span className="min-w-10 text-center">{qty}</span><button type="button" className="size-11" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Artır"><Plus className="mx-auto size-4" /></button></div><Button size="lg" onClick={add} className="min-h-11 flex-1 gap-2"><ShoppingCart className="size-4" />{added ? 'Sepete eklendi' : 'Sepete ekle'}</Button><Button size="lg" variant="outline" onClick={buyNow} className="min-h-11">Hemen al</Button></div>}
        {whatsapp && <a href={`${whatsapp.href}${whatsapp.href.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Merhaba, ${product.name} hakkında bilgi almak istiyorum: ${typeof window !== 'undefined' ? window.location.href : ''}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"><MessageCircle className="size-4" />WhatsApp ile sor</a>}
        <div className="grid gap-2 border-y border-border py-4 text-sm">{shipping.feeCents > 0 && <p className="flex gap-2"><Truck className="size-4" />{productShippingLine(shipping)}</p>}{shipping.deliveryNote && <p className="text-muted-foreground">{shipping.deliveryNote}</p>}</div>
      </section>
    </div>
    <section className="border-y border-border"><div role="tablist" className="flex gap-6 overflow-x-auto">{([['description','Açıklama'],['specs','Özellikler'],['delivery','Teslimat ve iade']] as const).map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className="min-h-12 border-b-2 px-1 text-sm font-semibold" style={{ borderColor: tab === value ? 'var(--site-primary)' : 'transparent' }}>{label}</button>)}</div><div className="py-6 leading-relaxed text-muted-foreground">{tab === 'description' && <p className="whitespace-pre-line">{product.description || 'Bu ürün için açıklama bulunmuyor.'}</p>}{tab === 'specs' && <div className="grid gap-2">{specs.length ? specs.map((spec, i) => <div key={`${spec.name}-${i}`} className="flex gap-3 border-b border-border py-2"><span className="font-medium text-foreground">{spec.name}</span><span>{spec.value || '✓'}</span></div>) : 'Bu ürün için özellik bilgisi bulunmuyor.'}</div>}{tab === 'delivery' && <p>{productShippingLine(shipping)}{product.shipping_note ? ` · ${product.shipping_note}` : ''}</p>}</div></section>
    {relatedProducts.length > 0 && <section><h2 className="mb-5 text-2xl font-bold">Benzer ürünler</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} slug={slug} />)}</div></section>}
    {pending !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"><h2 className="font-bold">Ürün zaten sepetinizde</h2><p className="mt-2 text-sm text-muted-foreground">Bir adet daha eklensin mi?</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={cancel}>Vazgeç</Button><Button onClick={() => { confirm(); flashAdded() }}>Evet, ekle</Button></div></div></div>}
  </div>
}
