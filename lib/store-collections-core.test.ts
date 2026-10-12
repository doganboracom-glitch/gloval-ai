import { describe, expect, it } from 'vitest'
import {
  CollectionStoreError,
  MAX_COLLECTIONS,
  MAX_PRODUCTS_PER_COLLECTION,
  collectionSlugBase,
  createCollectionsService,
  diffIds,
  uniqueCollectionSlug,
  validateCollectionName,
  type CollectionStore,
  type OwnerCollection,
} from './store-collections-core'

const P = 'project-1'

function makeStore(seed: OwnerCollection[] = [], ownedProducts: string[] = []) {
  const state = { collections: [...seed], inserts: [] as string[], calls: [] as string[] }
  let counter = 0
  const store: CollectionStore = {
    async list() {
      return state.collections.map((c) => ({ ...c, product_ids: [...c.product_ids] }))
    },
    async insert(_projectId, row) {
      state.calls.push('insert')
      if (state.collections.some((c) => c.slug === row.slug)) throw new CollectionStoreError('slug_taken')
      counter += 1
      const created: OwnerCollection = {
        id: `c${counter}`,
        ...row,
        auto_best_sellers: false,
        product_ids: [],
      }
      state.collections.push(created)
      state.inserts.push(row.slug)
      return created
    },
    async update(_p, id, patch) {
      state.calls.push('update')
      const c = state.collections.find((x) => x.id === id)
      if (c) Object.assign(c, patch)
    },
    async setSortOrders(_p, ids) {
      state.calls.push('setSortOrders')
      ids.forEach((id, i) => {
        const c = state.collections.find((x) => x.id === id)
        if (c) c.sort_order = i
      })
    },
    async remove(_p, id) {
      state.calls.push('remove')
      state.collections = state.collections.filter((c) => c.id !== id)
    },
    async projectProductIds(_p, ids) {
      return ids.filter((id) => ownedProducts.includes(id))
    },
    async replaceMembers(_p, id, ids) {
      state.calls.push('replaceMembers')
      const c = state.collections.find((x) => x.id === id)
      if (c) c.product_ids = ids
    },
    async replaceProductCollections(_p, productId, ids) {
      state.calls.push('replaceProductCollections')
      for (const c of state.collections) {
        c.product_ids = c.product_ids.filter((x) => x !== productId)
        if (ids.includes(c.id)) c.product_ids.push(productId)
      }
    },
  }
  return { store, state }
}

const col = (id: string, name: string, extra: Partial<OwnerCollection> = {}): OwnerCollection => ({
  id,
  name,
  slug: collectionSlugBase(name),
  sort_order: 0,
  auto_best_sellers: false,
  product_ids: [],
  ...extra,
})

describe('collection slugs', () => {
  it('folds Turkish letters and symbols into a url-safe slug', () => {
    expect(collectionSlugBase('Yaz İndirimi & Çok Satanlar!')).toBe('yaz-indirimi-cok-satanlar')
    expect(collectionSlugBase('!!!')).toBe('koleksiyon')
  })

  it('never exceeds 60 characters, even with a suffix', () => {
    const long = 'a'.repeat(100)
    expect(collectionSlugBase(long)).toHaveLength(60)
    const slug = uniqueCollectionSlug(long, new Set([collectionSlugBase(long)]))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-2')).toBe(true)
  })

  it('adds the next free numeric suffix', () => {
    expect(uniqueCollectionSlug('Yeni', new Set(['yeni', 'yeni-2']))).toBe('yeni-3')
  })
})

describe('validateCollectionName', () => {
  it('rejects empty, too long and duplicate (case/diacritic-insensitive) names', () => {
    expect(validateCollectionName('   ', []).ok).toBe(false)
    expect(validateCollectionName('x'.repeat(41), []).ok).toBe(false)
    expect(validateCollectionName('YAZ', [col('a', 'yaz')]).ok).toBe(false)
    expect(validateCollectionName('Işık', [col('a', 'isik')]).ok).toBe(false)
  })

  it('lets a collection keep its own name when renamed', () => {
    expect(validateCollectionName('Yaz', [col('a', 'Yaz')], 'a').ok).toBe(true)
  })
})

describe('diffIds', () => {
  it('splits additions and removals', () => {
    expect(diffIds(['a', 'b'], ['b', 'c'])).toEqual({ toAdd: ['c'], toRemove: ['a'] })
  })
})

describe('collections service', () => {
  it('creates a collection with the next sort order and a unique slug', async () => {
    const { store } = makeStore([col('a', 'Yaz', { sort_order: 4 })])
    const result = await createCollectionsService(store).create(P, 'Yaz ')
    expect(result.ok).toBe(false)
    const created = await createCollectionsService(store).create(P, 'Kış')
    expect(created.ok && created.collection).toMatchObject({ slug: 'kis', sort_order: 5 })
  })

  it('stops at the collection limit', async () => {
    const seed = Array.from({ length: MAX_COLLECTIONS }, (_, i) => col(`c${i}`, `Koleksiyon ${i}`))
    const { store, state } = makeStore(seed)
    const result = await createCollectionsService(store).create(P, 'Bir fazla')
    expect(result).toMatchObject({ ok: false, errors: [{ field: 'limit' }] })
    expect(state.calls).not.toContain('insert')
  })

  it('retries with a new slug when two creates race on the same slug', async () => {
    const { store, state } = makeStore()
    const service = createCollectionsService(store)
    const [a, b] = await Promise.all([service.create(P, 'Aynı Ad'), service.create(P, 'Aynı Ad')])
    // The in-memory list is read before either insert lands, so the second one collides.
    expect(a.ok && b.ok).toBe(true)
    expect(new Set(state.inserts).size).toBe(2)
  })

  it('keeps the slug when renaming so home sections stay bound', async () => {
    const { store, state } = makeStore([col('a', 'Yaz')])
    const result = await createCollectionsService(store).rename(P, 'a', 'Yaz Sezonu')
    expect(result.ok).toBe(true)
    expect(state.collections[0]).toMatchObject({ name: 'Yaz Sezonu', slug: 'yaz' })
  })

  it('refuses unknown collection ids', async () => {
    const { store, state } = makeStore([col('a', 'Yaz')])
    const service = createCollectionsService(store)
    for (const result of [
      await service.rename(P, 'zzz', 'X'),
      await service.remove(P, 'zzz'),
      await service.setAutoBestSellers(P, 'zzz', true),
      await service.setProducts(P, 'zzz', []),
    ]) {
      expect(result.ok).toBe(false)
    }
    expect(state.calls).toEqual([])
  })

  it('reorder requires exactly the known ids', async () => {
    const { store } = makeStore([col('a', 'A'), col('b', 'B')])
    const service = createCollectionsService(store)
    expect((await service.reorder(P, ['a'])).ok).toBe(false)
    expect((await service.reorder(P, ['a', 'x'])).ok).toBe(false)
    expect((await service.reorder(P, ['b', 'a', 'a'])).ok).toBe(true)
  })

  it('rejects products that belong to another store (IDOR)', async () => {
    const { store, state } = makeStore([col('a', 'A')], ['mine'])
    const service = createCollectionsService(store)
    expect((await service.setProducts(P, 'a', ['mine', 'theirs'])).ok).toBe(false)
    expect((await service.setProductCollections(P, 'theirs', ['a'])).ok).toBe(false)
    expect(state.calls).not.toContain('replaceMembers')
    expect(state.calls).not.toContain('replaceProductCollections')
  })

  it('rejects collection ids that are not part of the project when tagging a product', async () => {
    const { store } = makeStore([col('a', 'A')], ['mine'])
    const result = await createCollectionsService(store).setProductCollections(P, 'mine', ['a', 'foreign'])
    expect(result).toMatchObject({ ok: false, errors: [{ field: 'collection' }] })
  })

  it('dedupes product ids and caps the membership size', async () => {
    const owned = Array.from({ length: MAX_PRODUCTS_PER_COLLECTION + 1 }, (_, i) => `p${i}`)
    const { store, state } = makeStore([col('a', 'A')], owned)
    const service = createCollectionsService(store)
    expect((await service.setProducts(P, 'a', ['p1', 'p1', 'p2'])).ok).toBe(true)
    expect(state.collections[0].product_ids).toEqual(['p1', 'p2'])
    expect(await service.setProducts(P, 'a', owned)).toMatchObject({ ok: false, errors: [{ field: 'products' }] })
  })

  it('turns an unavailable table into a friendly error instead of throwing', async () => {
    const { store } = makeStore()
    store.list = async () => {
      throw new CollectionStoreError('unavailable')
    }
    const result = await createCollectionsService(store).create(P, 'Yaz')
    expect(result).toMatchObject({
      ok: false,
      errors: [{ message: 'Koleksiyonlar henüz etkinleştirilmedi.' }],
    })
  })

  it('maps unexpected store failures to a generic error', async () => {
    const { store } = makeStore()
    store.list = async () => {
      throw new Error('boom')
    }
    const result = await createCollectionsService(store).remove(P, 'a')
    expect(result.ok).toBe(false)
  })
})
