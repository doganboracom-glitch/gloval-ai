import { normalizeProductImages } from '@/lib/product-images'
import { readProductExtras } from '@/lib/store-product-display'
import type { StoreCollection, StoreProduct } from '@/lib/store'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EditorCatalog = {
  products: StoreProduct[]
  collections: StoreCollection[]
}

export type EditorCatalogDeps = {
  /** Must throw unless the caller owns the project (or is an admin). */
  authorize: (projectId: string) => Promise<unknown>
  /** Raw `ecommerce_products` rows queried by `project_id`. */
  readProducts: (projectId: string) => Promise<Record<string, unknown>[]>
  readCollections: (projectId: string) => Promise<StoreCollection[]>
}

function toStoreProduct(row: Record<string, unknown>): StoreProduct {
  const priceCents = Number(row.price_cents)
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    price_cents: priceCents,
    currency: typeof row.currency === 'string' ? row.currency : 'TRY',
    stock: Number(row.stock) || 0,
    images: normalizeProductImages(row.images),
    category_id: typeof row.category_id === 'string' ? row.category_id : null,
    track_stock: row.track_stock !== false,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    ...readProductExtras(row, priceCents),
  }
}

/**
 * Catalog for the editor preview. Unlike the public RPCs it also works for an
 * unpublished project, so ownership is verified first and every read is keyed
 * by `project_id`. Rows of another project or inactive products are dropped
 * even if a query misbehaves. Returns null when the caller may not see this
 * project's catalog or the id is not a UUID.
 */
export async function loadEditorCatalog(
  projectId: string,
  deps: EditorCatalogDeps,
): Promise<EditorCatalog | null> {
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return null
  try {
    await deps.authorize(projectId)
  } catch {
    return null
  }

  const [rows, collections] = await Promise.all([
    deps.readProducts(projectId),
    deps.readCollections(projectId).catch(() => [] as StoreCollection[]),
  ])

  const products = rows
    .filter((row) => row.project_id === projectId && (row.status ?? 'active') === 'active')
    .map(toStoreProduct)
  const ids = new Set(products.map((p) => p.id))

  return {
    products,
    collections: collections.map((c) => ({
      ...c,
      product_ids: c.product_ids.filter((id) => ids.has(id)),
    })),
  }
}
