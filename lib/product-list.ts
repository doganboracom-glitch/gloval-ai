/** Plain helpers for the owner's product list. */

type Listable = {
  name: string
  sku: string | null
  stock: number
  track_stock?: boolean
}

/** "Sınırsız", "Tükendi" or "12 adet". */
export function stockLabel(product: Pick<Listable, 'stock' | 'track_stock'>): string {
  if (product.track_stock === false) return 'Sınırsız'
  if (product.stock <= 0) return 'Tükendi'
  return `${product.stock} adet`
}

export type StatusFilter = 'all' | 'active' | 'draft' | 'archived'

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'draft', label: 'Taslak' },
  { value: 'archived', label: 'Arşiv' },
]

export function matchesStatus(product: { status: string }, filter: StatusFilter): boolean {
  return filter === 'all' || product.status === filter
}

/** Product counts per filter tab; `all` is the total. */
export function countByStatus(products: ReadonlyArray<{ status: string }>): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: products.length, active: 0, draft: 0, archived: 0 }
  for (const p of products) {
    if (p.status === 'active' || p.status === 'draft' || p.status === 'archived') counts[p.status] += 1
  }
  return counts
}

function fold(text: string): string {
  return text.toLocaleLowerCase('tr').trim()
}

/** Case-insensitive (Turkish-aware) match on name and SKU. An empty query matches everything. */
export function matchesSearch(product: Pick<Listable, 'name' | 'sku'>, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  return fold(product.name).includes(q) || fold(product.sku ?? '').includes(q)
}
