'use client'

import { useEffect, useMemo, useState } from 'react'
import { PackageOpen, Search, SlidersHorizontal, X } from 'lucide-react'
import type { StoreCollection, StoreProduct } from '@/lib/store'
import { ProductCard } from './product-card'
import type { ShippingSettings } from '@/lib/store-shipping-rules'

type StoreFrontProps = {
  slug: string
  storeName: string
  products: StoreProduct[]
  collections?: StoreCollection[]
  shipping?: ShippingSettings
}

const MAX_CLIENT_PRODUCTS = 500
const PAGE_SIZE = 24

type Filters = { q: string; kategori: string; koleksiyon: string; sirala: string; min: string; max: string; indirim: boolean; stok: boolean }
const defaults: Filters = { q: '', kategori: '', koleksiyon: '', sirala: '', min: '', max: '', indirim: false, stok: false }

function fold(value: string) {
  return value.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/İ/g, 'i').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}
function readFilters(): Filters {
  if (typeof window === 'undefined') return defaults
  const p = new URLSearchParams(window.location.search)
  return { q: p.get('q') ?? '', kategori: p.get('kategori') ?? '', koleksiyon: p.get('koleksiyon') ?? '', sirala: p.get('sirala') ?? '', min: p.get('min') ?? '', max: p.get('max') ?? '', indirim: p.get('indirim') === '1', stok: p.get('stok') === '1' }
}
function writeFilters(filters: Filters) {
  const p = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) p.set(key, value === true ? '1' : String(value).slice(0, 80))
  const url = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`
  window.history.replaceState(null, '', url)
}

export function StoreFront({ slug, storeName, products, collections = [] }: StoreFrontProps) {
  const [filters, setFilters] = useState<Filters>(readFilters)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [drawer, setDrawer] = useState(false)
  const safeProducts = products.slice(0, MAX_CLIENT_PRODUCTS)
  const categories = useMemo(() => Array.from(new Set(safeProducts.map((p) => (p as StoreProduct & { category_name?: string }).category_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'tr')), [safeProducts])
  const collection = collections.find((c) => c.slug === filters.koleksiyon)
  const collectionIds = collection ? new Set(collection.product_ids) : null

  useEffect(() => { writeFilters(filters); setVisible(PAGE_SIZE) }, [filters])
  useEffect(() => { const onPop = () => setFilters(readFilters()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])

  const filtered = useMemo(() => {
    const query = fold(filters.q.trim())
    const min = Number(filters.min) || 0
    const max = Number(filters.max) || Number.POSITIVE_INFINITY
    const result = safeProducts.filter((p) => {
      const row = p as StoreProduct & { category_name?: string; sku?: string | null }
      const haystack = fold([p.name, p.description ?? '', row.category_name ?? '', row.sku ?? ''].join(' '))
      const discount = p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents
      return (!query || haystack.includes(query)) && (!filters.kategori || row.category_name === filters.kategori) && (!collectionIds || collectionIds.has(p.id)) && p.price_cents >= min * 100 && p.price_cents <= max * 100 && (!filters.indirim || discount) && (!filters.stok || p.stock > 0) 
    })
    return result.sort((a, b) => {
      if (filters.sirala === 'yeni') return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      if (filters.sirala === 'artan') return a.price_cents - b.price_cents
      if (filters.sirala === 'azalan') return b.price_cents - a.price_cents
      if (filters.sirala === 'indirim') return ((b.compare_at_price_cents ?? b.price_cents) - b.price_cents) / (b.compare_at_price_cents || 1) - ((a.compare_at_price_cents ?? a.price_cents) - a.price_cents) / (a.compare_at_price_cents || 1)
      return 0
    })
  }, [safeProducts, filters, collectionIds])

  const clear = () => setFilters(defaults)
  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const controls = <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mağaza filtreleri">
    <select aria-label="Kategori" value={filters.kategori} onChange={(e) => update({ kategori: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Tüm kategoriler</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
    <select aria-label="Koleksiyon" value={filters.koleksiyon} onChange={(e) => update({ koleksiyon: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Tüm koleksiyonlar</option>{collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
    <select aria-label="Sıralama" value={filters.sirala} onChange={(e) => update({ sirala: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="">Önerilen</option><option value="yeni">En yeniler</option><option value="artan">Fiyat: artan</option><option value="azalan">Fiyat: azalan</option><option value="indirim">İndirim oranı</option></select>
    <input aria-label="En düşük fiyat" inputMode="decimal" placeholder="Min TL" value={filters.min} onChange={(e) => update({ min: e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') })} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    <input aria-label="En yüksek fiyat" inputMode="decimal" placeholder="Max TL" value={filters.max} onChange={(e) => update({ max: e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') })} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.indirim} onChange={(e) => update({ indirim: e.target.checked })} /> İndirimde</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.stok} onChange={(e) => update({ stok: e.target.checked })} /> Stokta</label>
  </div>

  return <div className="bg-background text-foreground"><div className="mx-auto max-w-6xl px-4 py-10">
    <h1 className="mb-6 font-display text-2xl font-bold sm:text-3xl">{storeName}<span className="sr-only"> - Ürünler</span></h1>
    <div className="mb-6 flex gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input aria-label="Ürünlerde ara" value={filters.q} onChange={(e) => update({ q: e.target.value })} placeholder="Ürün, açıklama, kategori veya SKU ara" className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-10 text-sm" />{filters.q && <button aria-label="Aramayı temizle" onClick={() => update({ q: '' })} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4" /></button>}</div><button type="button" onClick={() => setDrawer(!drawer)} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 text-sm lg:hidden"><SlidersHorizontal className="size-4" /> Filtrele</button></div>
    <div className={`${drawer ? 'block' : 'hidden'} mb-6 lg:block`}>{controls}</div>
    <div className="mb-5 flex items-center justify-between text-sm text-muted-foreground"><span aria-live="polite">{filtered.length} ürün</span>{(filters.q || filters.kategori || filters.koleksiyon || filters.min || filters.max || filters.indirim || filters.stok) && <button onClick={clear} className="font-medium text-foreground underline">Filtreleri temizle</button>}</div>
    {filtered.length === 0 ? <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center"><PackageOpen className="size-10 text-muted-foreground" aria-hidden /><p className="text-lg font-medium">Aradığınız ürün bulunamadı</p><button onClick={clear} className="text-sm underline">Filtreleri temizle</button></div> : <><div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{filtered.slice(0, visible).map((p) => <ProductCard key={p.id} slug={slug} product={p} categoryName={(p as StoreProduct & { category_name?: string }).category_name} />)}</div>{visible < filtered.length && <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="mx-auto mt-8 block rounded-xl border border-border px-5 py-3 text-sm font-medium">Daha fazla göster</button>}</>}
    {products.length > MAX_CLIENT_PRODUCTS && <p className="mt-6 text-center text-xs text-muted-foreground">İlk {MAX_CLIENT_PRODUCTS} ürün gösteriliyor.</p>}
  </div></div>
}
