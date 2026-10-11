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

function fold(text: string): string {
  return text.toLocaleLowerCase('tr').trim()
}

/** Case-insensitive (Turkish-aware) match on name and SKU. An empty query matches everything. */
export function matchesSearch(product: Pick<Listable, 'name' | 'sku'>, query: string): boolean {
  const q = fold(query)
  if (!q) return true
  return fold(product.name).includes(q) || fold(product.sku ?? '').includes(q)
}
