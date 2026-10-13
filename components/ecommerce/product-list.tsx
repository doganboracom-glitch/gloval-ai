'use client'

import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ImagePlus, Loader2, Package, Pencil, Plus, Search } from 'lucide-react'
import type { CategoryRow, ProductRow, ProductStatus } from '@/lib/ecommerce'
import { lacksImage } from '@/lib/product-image-placeholder'
import { formatTry } from '@/lib/product-form'
import { countByStatus, matchesSearch, matchesStatus, STATUS_FILTERS, stockLabel, type StatusFilter } from '@/lib/product-list'
import { Button } from '@/components/ui/button'

const STATUS_LABELS: Record<ProductStatus, string> = { active: 'Aktif', draft: 'Taslak', archived: 'Arşiv' }

type Props = {
  products: ProductRow[]
  categories: CategoryRow[]
  publishingId?: string | null
  onAdd: () => void
  onEdit: (product: ProductRow) => void
  onRemove: (product: ProductRow) => void
  onPublish: (product: ProductRow) => void
}

export function ProductList({ products, categories, publishingId = null, onAdd, onEdit, onRemove, onPublish }: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const counts = useMemo(() => countByStatus(products), [products])
  const visible = useMemo(
    () => products.filter((p) => matchesStatus(p, statusFilter) && matchesSearch(p, query)),
    [products, statusFilter, query],
  )
  const filtering = query.trim() !== '' || statusFilter !== 'all'
  const clearFilters = () => {
    setQuery('')
    setStatusFilter('all')
  }
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Kategorisiz'

  if (products.length === 0) {
    return (
      <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="size-7" />
        </div>
        <p className="mt-5 text-lg font-medium">Henüz ürününüz yok</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Mağazanızda satışa başlamak için ilk ürününüzü ekleyin. Görsel, fiyat ve açıklama yeterli.
        </p>
        <Button onClick={onAdd} className="mt-6 gap-2">
          <Plus className="size-4" />
          İlk ürününüzü ekleyin
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Ürün ara"
          placeholder="Ürün adı veya stok kodu ara"
          className="h-11 w-full rounded-lg border border-input bg-card/70 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div role="group" aria-label="Duruma göre filtrele" className="mt-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const selected = statusFilter === f.value
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              aria-pressed={selected}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
                selected
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.label}
              <span className="text-xs tabular-nums text-muted-foreground">{counts[f.value]}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <p className="font-medium">{filtering ? 'Eşleşen ürün yok' : 'Gösterilecek ürün yok'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter !== 'all'
              ? `“${STATUS_FILTERS.find((f) => f.value === statusFilter)?.label}” durumunda ürün bulunamadı. Aramayı veya filtreyi değiştirin.`
              : 'Farklı bir ürün adı veya stok kodu deneyin.'}
          </p>
          <Button variant="outline" onClick={clearFilters} className="mt-4">
            Filtreleri temizle
          </Button>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((p) => {
            const hasCompare = p.compare_at_price_cents != null && p.compare_at_price_cents > p.price_cents
            const outOfStock = p.track_stock !== false && p.stock <= 0
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0].url || '/placeholder.svg'} alt={p.images[0].alt || p.name} className="size-full object-cover" />
                    ) : (
                      <Package aria-hidden className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-medium">{p.name}</h2>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'active'
                            ? 'bg-accent/15 text-accent'
                            : p.status === 'archived'
                              ? 'border border-border bg-muted text-muted-foreground'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {p.status === 'archived' && <Archive aria-hidden className="size-3" />}
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {categoryName(p.category_id)}
                      {p.sku ? ` · ${p.sku}` : ''}
                    </p>
                    {lacksImage(p) && (
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        aria-label={`${p.name} için görsel ekle`}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <ImagePlus aria-hidden className="size-3" />
                        Görsel ekle
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-baseline justify-between gap-3 sm:block sm:shrink-0 sm:text-right">
                  <p className="font-medium">
                    {formatTry(p.price_cents / 100)}
                    {hasCompare && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground line-through">
                        {formatTry((p.compare_at_price_cents as number) / 100)}
                      </span>
                    )}
                  </p>
                  <p className={`text-sm ${outOfStock ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    Stok: {stockLabel(p)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {p.status === 'archived' && (
                    <Button
                      onClick={() => onPublish(p)}
                      disabled={publishingId !== null}
                      aria-label={`${p.name} ürününü yayına al`}
                      className="h-10 flex-1 gap-2 sm:flex-none"
                    >
                      {publishingId === p.id ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
                      Yayına al
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => onEdit(p)} className="h-10 flex-1 gap-2 sm:flex-none">
                    <Pencil className="size-4" />
                    Düzenle
                  </Button>
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    aria-label={`${p.name} ürününü arşivle veya sil`}
                    title="Arşivle veya sil"
                    className="flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Archive className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
