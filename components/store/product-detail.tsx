'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Minus, Plus, ShoppingCart, Truck, MessageCircle, ShieldCheck, CreditCard, Sparkles } from 'lucide-react'
import { ProductGallery } from './product-gallery'
import { ProductCard } from './product-card'
import { discountPercent } from '@/lib/store-product-display'
import { useCart, useAddWithConfirm, formatPrice, requestOpenCart } from './cart-provider'
import { TryOnButton } from './try-on-button'
import type { StoreProduct } from '@/lib/store'
import { getStockNotice, isSoldOut, purchasableMax } from '@/lib/store-stock'
import { DEFAULT_SHIPPING_SETTINGS, type ShippingSettings } from '@/lib/store-shipping-rules'
import { productShippingLine } from '@/lib/store-shipping-display'
import { catalogDisplayPrice, useCatalog, whatsappOrderHref } from './catalog-context'
import { WHATSAPP_ORDER_LABEL } from '@/lib/commerce-mode'

type Props = { slug: string; storeName: string; product: StoreProduct; relatedProducts?: StoreProduct[]; enableTryOn?: boolean; shipping?: ShippingSettings; whatsapp?: { href: string; display: string } | null; cardPaymentEnabled?: boolean; codEnabled?: boolean }

const themedButton = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--site-radius,0.75rem)] px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary,var(--primary))] disabled:cursor-not-allowed disabled:opacity-50'

export function ProductDetail(props: Props) { return <ProductDetailInner {...props} /> }

function ProductDetailInner({ slug, storeName, product, relatedProducts = [], enableTryOn = false, shipping = DEFAULT_SHIPPING_SETTINGS, whatsapp, cardPaymentEnabled = false, codEnabled = false }: Props) {
  const cart = useCart()
  const catalog = useCatalog()
  const isCatalog = catalog?.mode === 'catalog'
  const orderHref = isCatalog ? whatsappOrderHref(catalog, product) : null
  const priceText = isCatalog ? catalogDisplayPrice(product) : formatPrice(product.price_cents, product.currency)
  const askPrice = isCatalog && product.price_mode === 'ask'
  const { requestAdd } = useAddWithConfirm(cart)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [tab, setTab] = useState<'description' | 'specs' | 'delivery'>('description')
  const flashTimer = useRef<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const image = product.images[0]?.url ?? null
  const outOfStock = isSoldOut(product)
  const maxQty = purchasableMax(product)
  const stockNotice = getStockNotice(product)
  const discount = discountPercent(product.price_cents, product.compare_at_price_cents)
  const specs = product.specs ?? []
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current) }, [])
  const flashAdded = () => { setAdded(true); requestOpenCart(); if (flashTimer.current) window.clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setAdded(false), 1800) }
  const item = { productId: product.id, name: product.name, priceCents: product.price_cents, currency: product.currency, image, maxStock: maxQty }
  const add = () => { const already = cart.items.some((i) => i.productId === product.id); requestAdd(item, qty); if (!already) flashAdded() }
  const buyNow = () => { const already = cart.items.some((i) => i.productId === product.id); if (!already) cart.add(item, qty); window.location.href = `/site/${slug}/checkout` }
  const waHref = whatsapp ? `${whatsapp.href}${whatsapp.href.includes('?') ? '&' : '?'}text=${encodeURIComponent(`Merhaba, ${product.name} hakkında bilgi almak istiyorum`)}` : null
  const trustItems = isCatalog ? [] : [cardPaymentEnabled && { icon: CreditCard, text: 'Güvenli ödeme' }, codEnabled && { icon: Check, text: 'Kapıda ödeme mevcut' }, (shipping.feeCents > 0 || shipping.freeThresholdCents !== null) && { icon: Truck, text: productShippingLine(shipping) }, shipping.deliveryNote && { icon: ShieldCheck, text: shipping.deliveryNote }].filter(Boolean) as { icon: typeof Check; text: string }[]

  return <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6 pb-28 md:py-10 md:pb-10">
    <nav aria-label="Kırıntı yolu" className="text-sm text-muted-foreground"><a href={`/site/${slug}`}>Ana sayfa</a><span aria-hidden> › </span><a href={`/site/${slug}/store`}>Ürünler</a><span aria-hidden> › </span><span>{product.name}</span></nav>
    <div className="grid gap-10 md:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] md:items-start">
      <ProductGallery images={product.images} name={product.name} />
      <section className="flex flex-col gap-5 md:sticky md:top-[calc(var(--site-header-h,4rem)+1.5rem)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--site-primary, var(--primary))' }}>{storeName}</p>
        <h1 className="text-balance text-3xl font-bold leading-tight md:text-4xl" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>{product.name}</h1>
        <div className="flex flex-wrap items-end gap-3"><span className="text-3xl font-bold">{priceText}</span>{!askPrice && discount !== null && product.compare_at_price_cents != null && <><span className="text-sm text-muted-foreground line-through">{formatPrice(product.compare_at_price_cents, product.currency)}</span><span className="rounded-full bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">%{discount} indirim</span></>}{!askPrice && <span className="w-full text-xs text-muted-foreground">KDV dahil</span>}</div>
        {stockNotice && <span className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-semibold ${stockNotice.kind === 'sold_out' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700'}`} role="status">{stockNotice.text}</span>}
        {product.description && <p className="line-clamp-3 leading-relaxed text-muted-foreground">{product.description.split(/\n\s*\n/)[0]}</p>}
        {!outOfStock && !isCatalog && <><div className="flex min-h-12 w-fit items-center rounded-[var(--site-radius,0.75rem)] border border-[var(--site-border,var(--border))]"><button type="button" className="size-12" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Azalt"><Minus className="mx-auto size-4" /></button><span className="min-w-10 text-center font-semibold">{qty}</span><button type="button" disabled={qty >= maxQty} className="size-12 disabled:opacity-40" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Artır"><Plus className="mx-auto size-4" /></button></div><button type="button" onClick={add} className={themedButton + ' w-full'} style={{ backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }}><ShoppingCart className="size-4" />{added ? 'Sepete eklendi' : 'Sepete ekle'}</button><button type="button" onClick={buyNow} className={themedButton + ' w-full border'} style={{ borderColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary, var(--primary))' }}>Hemen al</button></>}
        <div className="grid gap-2 sm:grid-cols-2">{orderHref && <a href={orderHref} target="_blank" rel="noopener noreferrer" data-whatsapp-order className={themedButton + ' sm:col-span-2'} style={{ backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }}><MessageCircle className="size-4" />{WHATSAPP_ORDER_LABEL}</a>}{!isCatalog && waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" className={themedButton + ' border border-emerald-600/50 text-emerald-700'}><MessageCircle className="size-4" />WhatsApp ile sor</a>}{enableTryOn && image && <TryOnButton productImage={image} productName={product.name} lang="tr" target={{ mode: 'store', storeSlug: slug }} trigger={({ onClick }) => <button type="button" onClick={onClick} className={themedButton + ' border'} style={{ borderColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary, var(--primary))' }}><Sparkles className="size-4" />Sanal dene</button>} />}</div>
        {trustItems.length > 0 && <div className="grid grid-cols-2 gap-3 border-y border-[var(--site-border,var(--border))] py-4">{trustItems.map(({ icon: Icon, text }) => <div key={text} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Icon className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--site-primary, var(--primary))' }} />{text}</div>)}</div>}
      </section>
    </div>
    <section className="border-y border-[var(--site-border,var(--border))]"><div role="tablist" aria-label="Ürün bilgileri" className="flex gap-4 overflow-x-auto">{([['description','Açıklama'],['specs','Özellikler'],['delivery','Teslimat ve iade']] as const).map(([value,label], index, tabs) => <button key={value} id={`tab-${value}`} type="button" role="tab" tabIndex={tab === value ? 0 : -1} aria-controls={`panel-${value}`} aria-selected={tab === value} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setTab(tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length][0]) } }} onClick={() => setTab(value)} className="min-h-12 shrink-0 border-b-2 px-1 text-sm font-semibold" style={{ borderColor: tab === value ? 'var(--site-primary, var(--primary))' : 'transparent' }}>{label}</button>)}</div><div className="max-w-3xl py-6 leading-relaxed text-muted-foreground">{tab === 'description' && <p className="whitespace-pre-line">{product.description || 'Bu ürün için açıklama bulunmuyor.'}</p>}{tab === 'specs' && <div className="grid gap-2">{specs.length ? specs.map((spec, i) => <div key={`${spec.name}-${i}`} className="flex gap-3 border-b border-border py-3"><Check className="mt-1 size-4 shrink-0" style={{ color: 'var(--site-primary, var(--primary))' }} /><span><strong className="text-foreground">{spec.name}</strong>{spec.value ? `: ${spec.value}` : ''}</span></div>) : 'Bu ürün için özellik bilgisi bulunmuyor.'}</div>}{tab === 'delivery' && <p>{productShippingLine(shipping)}{product.shipping_note ? ` · ${product.shipping_note}` : ''}</p>}</div></section>
    {relatedProducts.length > 0 && <section><h2 className="mb-5 text-2xl font-bold">Benzer ürünler</h2><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} slug={slug} />)}</div></section>}
    {!outOfStock && isCatalog && orderHref && <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden"><span className="font-bold">{priceText}</span><a href={orderHref} target="_blank" rel="noopener noreferrer" className={themedButton + ' min-h-11 flex-1'} style={{ backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }}><MessageCircle className="size-4" />{WHATSAPP_ORDER_LABEL}</a></div>}
    {!outOfStock && !isCatalog && <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 p-3 backdrop-blur md:hidden"><span className="font-bold">{formatPrice(product.price_cents, product.currency)}</span><button type="button" onClick={add} className={themedButton + ' min-h-11 flex-1'} style={{ backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }}><ShoppingCart className="size-4" />Sepete ekle</button></div>}

  </div>
}
