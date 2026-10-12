import { describe, expect, it, vi } from 'vitest'
import { loadEditorCatalog, type EditorCatalogDeps } from './store-editor-catalog-core'
import type { StoreCollection } from './store'

const P = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  project_id: P,
  name: `Ürün ${id}`,
  slug: `urun-${id}`,
  price_cents: 1500,
  currency: 'TRY',
  stock: 3,
  images: [],
  status: 'active',
  ...extra,
})

const collection = (productIds: string[]): StoreCollection => ({
  id: 'c1',
  name: 'Yeni',
  slug: 'yeni',
  sort_order: 0,
  auto_best_sellers: false,
  product_ids: productIds,
})

function deps(over: Partial<EditorCatalogDeps> = {}): EditorCatalogDeps {
  return {
    authorize: vi.fn(async () => ({})),
    readProducts: vi.fn(async () => [row('a'), row('b')]),
    readCollections: vi.fn(async () => [collection(['a'])]),
    ...over,
  }
}

describe('loadEditorCatalog', () => {
  it('returns the owner products and collections of an unpublished project', async () => {
    const result = await loadEditorCatalog(P, deps())
    expect(result?.products.map((p) => p.id)).toEqual(['a', 'b'])
    expect(result?.collections[0].product_ids).toEqual(['a'])
  })

  it('never reads data when the caller is not the owner', async () => {
    const d = deps({
      authorize: vi.fn(async () => {
        throw new Error('NOT_FOUND')
      }),
    })
    expect(await loadEditorCatalog(P, d)).toBeNull()
    expect(d.readProducts).not.toHaveBeenCalled()
    expect(d.readCollections).not.toHaveBeenCalled()
  })

  it('rejects a non-uuid project id before authorizing', async () => {
    const d = deps()
    expect(await loadEditorCatalog('x', d)).toBeNull()
    expect(d.authorize).not.toHaveBeenCalled()
  })

  it('drops other projects rows and inactive products, even if the query returns them', async () => {
    const d = deps({
      readProducts: vi.fn(async () => [
        row('a'),
        row('foreign', { project_id: OTHER }),
        row('draft', { status: 'draft' }),
      ]),
      readCollections: vi.fn(async () => [collection(['a', 'foreign', 'draft'])]),
    })
    const result = await loadEditorCatalog(P, d)
    expect(result?.products.map((p) => p.id)).toEqual(['a'])
    expect(result?.collections[0].product_ids).toEqual(['a'])
  })

  it('keeps products when collections are unavailable', async () => {
    const d = deps({
      readCollections: vi.fn(async () => {
        throw new Error('missing table')
      }),
    })
    const result = await loadEditorCatalog(P, d)
    expect(result?.products).toHaveLength(2)
    expect(result?.collections).toEqual([])
  })
})
