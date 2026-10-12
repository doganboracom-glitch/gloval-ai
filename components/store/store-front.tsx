'use client'

import { useEffect, useMemo, useState } from 'react'
import { PackageOpen, Search, SlidersHorizontal, X } from 'lucide-react'
import type { StoreCollection, StoreProduct } from '@/lib/store'
import type { ShippingSettings } from '@/lib/store-shipping-rules'
import {
  DEFAULT_FILTERS,
  MAX_CLIENT_PRODUCTS,
  MAX_QUERY_LENGTH,
  PAGE_SIZE,
  applyDiscovery,
  categoryNames,
  hasActiveFilters,
  parseFilters,
  serializeFilters,
  type DiscoveryFilters,
} from '@/lib/store-discovery'
import { ProductCard } from './product-card'

type StoreFrontProps = {
  slug: string
  storeName: string
  products: StoreProduct[]
  collections?: StoreCollection[]
  shipping?: ShippingSettings
  /** Query params from the request, so server and client first paint match. */
  initialParams?: Record<string, string | string[] | undefined>
}

const chipBase =
  'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'
const chipOff = 'border-border bg-background text-foreground hover:bg-muted'
const chipOn = 'border-foreground bg-foreground text-background'
const fieldClass =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'

function Chips({
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  label: string
  allLabel: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        type="button"
        aria-pressed={value === ''}
        onClick={() => onChange('')}
        className={`${chipBase} ${value === '' ? chipOn : chipOff}`}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(value === option.value ? '' : option.value)}
          className={`${chipBase} ${value === option.value ? chipOn : chipOff}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="TL"
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.').slice(0, 11))
        }
        className={`${fieldClass} w-24`}
      />
    </label>
  )
}

export function StoreFront({
  slug,
  storeName,
  products,
  collections = [],
  initialParams = {},
}: StoreFrontProps) {
  const catalog = useMemo(() => products.slice(0, MAX_CLIENT_PRODUCTS), [products])
  const categories = useMemo(() => categoryNames(catalog), [catalog])
  const known = useMemo(
    () => ({ categories, collections: collections.map((c) => c.slug) }),
    [categories, collections],
  )

  const [filters, setFilters] = useState<DiscoveryFilters>(() => parseFilters(initialParams, known))
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    const query = serializeFilters(filters)
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  }, [filters])

  useEffect(() => {
    const onPopState = () => {
      setFilters(parseFilters(new URLSearchParams(window.location.search), known))
      setVisible(PAGE_SIZE)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [known])

  const results = useMemo(
    () => applyDiscovery(catalog, filters, collections),
    [catalog, filters, collections],
  )

  const update = (patch: Partial<DiscoveryFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setVisible(PAGE_SIZE)
  }
  const clear = () => {
    setFilters(DEFAULT_FILTERS)
    setVisible(PAGE_SIZE)
  }

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 font-display text-2xl font-bold sm:text-3xl">
          {storeName}
          <span className="sr-only"> - Ürünler</span>
        </h1>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              aria-label="Ürünlerde ara"
              value={filters.q}
              maxLength={MAX_QUERY_LENGTH}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Ürün, açıklama, kategori veya SKU ara"
              className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-10 text-sm"
            />
            {filters.q && (
              <button
                type="button"
                aria-label="Aramayı temizle"
                onClick={() => update({ q: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 text-sm lg:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden /> Filtrele
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-2">
          <Chips
            label="Kategori"
            allLabel="Tümü"
            options={categories.map((name) => ({ value: name, label: name }))}
            value={filters.kategori}
            onChange={(kategori) => update({ kategori })}
          />
          <Chips
            label="Koleksiyon"
            allLabel="Tüm koleksiyonlar"
            options={collections.map((c) => ({ value: c.slug, label: c.name }))}
            value={filters.koleksiyon}
            onChange={(koleksiyon) => update({ koleksiyon })}
          />
        </div>

        <div
          role="group"
          aria-label="Fiyat ve sıralama"
          className={`${panelOpen ? 'flex' : 'hidden'} mb-6 flex-wrap items-center gap-3 lg:flex`}
        >
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sırala</span>
            <select
              value={filters.sirala}
              onChange={(e) => update({ sirala: e.target.value as DiscoveryFilters['sirala'] })}
              className={fieldClass}
            >
              <option value="">Önerilen</option>
              <option value="yeni">En yeniler</option>
              <option value="artan">Fiyat: artan</option>
              <option value="azalan">Fiyat: azalan</option>
              <option value="indirim">İndirim oranı</option>
            </select>
          </label>
          <PriceField label="En düşük fiyat" value={filters.min} onChange={(min) => update({ min })} />
          <PriceField label="En yüksek fiyat" value={filters.max} onChange={(max) => update({ max })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.indirim}
              onChange={(e) => update({ indirim: e.target.checked })}
            />
            İndirimde
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.stok}
              onChange={(e) => update({ stok: e.target.checked })}
            />
            Stokta
          </label>
        </div>

        <div className="mb-5 flex items-center justify-between text-sm text-muted-foreground">
          <span aria-live="polite">{results.length} ürün</span>
          {hasActiveFilters(filters) && (
            <button type="button" onClick={clear} className="font-medium text-foreground underline">
              Filtreleri temizle
            </button>
          )}
        </div>

        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
            <PackageOpen className="size-10 text-muted-foreground" aria-hidden />
            <p className="text-lg font-medium">Aradığınız ürün bulunamadı</p>
            {hasActiveFilters(filters) && (
              <button type="button" onClick={clear} className="text-sm underline">
                Filtreleri temizle
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.slice(0, visible).map((product) => (
                <ProductCard
                  key={product.id}
                  slug={slug}
                  product={product}
                  categoryName={product.category_name ?? undefined}
                />
              ))}
            </div>
            {visible < results.length && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="mx-auto mt-8 block rounded-xl border border-border px-5 py-3 text-sm font-medium"
              >
                Daha fazla göster
              </button>
            )}
          </>
        )}

        {products.length > MAX_CLIENT_PRODUCTS && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            İlk {MAX_CLIENT_PRODUCTS} ürün gösteriliyor.
          </p>
        )}
      </div>
    </div>
  )
}
