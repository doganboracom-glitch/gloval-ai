export const MAX_COLLECTIONS = 12
export const COLLECTION_NAME_MAX = 40
export const MAX_PRODUCTS_PER_COLLECTION = 500

export type OwnerCollection = {
  id: string
  name: string
  slug: string
  sort_order: number
  auto_best_sellers: boolean
  /** Every member, active or not, in no particular order. */
  product_ids: string[]
}

export type CollectionField = 'name' | 'collection' | 'products' | 'limit'
export type CollectionFieldError = { field: CollectionField; message: string }
export type CollectionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; errors: CollectionFieldError[] }

export class CollectionStoreError extends Error {
  constructor(readonly kind: 'slug_taken' | 'limit' | 'unavailable') {
    super(kind)
  }
}

/** Persistence port; every method is already scoped to one project. */
export interface CollectionStore {
  list(projectId: string): Promise<OwnerCollection[]>
  insert(
    projectId: string,
    row: { name: string; slug: string; sort_order: number },
  ): Promise<OwnerCollection>
  update(
    projectId: string,
    id: string,
    patch: { name?: string; auto_best_sellers?: boolean },
  ): Promise<void>
  setSortOrders(projectId: string, orderedIds: string[]): Promise<void>
  remove(projectId: string, id: string): Promise<void>
  /** Which of `ids` are products of this project. */
  projectProductIds(projectId: string, ids: string[]): Promise<string[]>
  replaceMembers(projectId: string, collectionId: string, productIds: string[]): Promise<void>
  replaceProductCollections(
    projectId: string,
    productId: string,
    collectionIds: string[],
  ): Promise<void>
}

const MESSAGES = {
  nameRequired: 'Koleksiyon adı boş olamaz.',
  nameTooLong: `Koleksiyon adı en fazla ${COLLECTION_NAME_MAX} karakter olabilir.`,
  nameTaken: 'Bu isimde bir koleksiyon zaten var.',
  limit: `Bir mağazada en fazla ${MAX_COLLECTIONS} koleksiyon olabilir.`,
  notFound: 'Koleksiyon bulunamadı. Sayfayı yenileyip tekrar dene.',
  foreignProducts: 'Seçilen ürünlerden biri bu mağazaya ait değil. Sayfayı yenileyip tekrar dene.',
  tooManyProducts: `Bir koleksiyona en fazla ${MAX_PRODUCTS_PER_COLLECTION} ürün eklenebilir.`,
  unavailable: 'Koleksiyonlar henüz etkinleştirilmedi.',
  unexpected: 'Beklenmeyen bir hata oluştu. Lütfen tekrar dene.',
} as const

const TURKISH_FOLD: Record<string, string> = {
  ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c',
}

function foldToAscii(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/[ığüşöç]/g, (c) => TURKISH_FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function normalizeCollectionName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Lowercase letters, digits and hyphens only; never empty. */
export function collectionSlugBase(name: string): string {
  const slug = foldToAscii(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'koleksiyon'
}

export function uniqueCollectionSlug(name: string, taken: ReadonlySet<string>): string {
  const base = collectionSlugBase(name)
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, 60 - suffix.length).replace(/-+$/g, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export function validateCollectionName(
  raw: string,
  existing: readonly OwnerCollection[],
  ignoreId?: string,
): { ok: true; name: string } | { ok: false; error: CollectionFieldError } {
  const name = normalizeCollectionName(typeof raw === 'string' ? raw : '')
  if (!name) return { ok: false, error: { field: 'name', message: MESSAGES.nameRequired } }
  if (name.length > COLLECTION_NAME_MAX) {
    return { ok: false, error: { field: 'name', message: MESSAGES.nameTooLong } }
  }
  const folded = foldToAscii(name)
  if (existing.some((c) => c.id !== ignoreId && foldToAscii(c.name) === folded)) {
    return { ok: false, error: { field: 'name', message: MESSAGES.nameTaken } }
  }
  return { ok: true, name }
}

export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

/** Writes insert-before-delete, so a failure part-way leaves a superset, never a loss. */
export function diffIds(current: readonly string[], next: readonly string[]) {
  const have = new Set(current)
  const want = new Set(next)
  return {
    toAdd: [...want].filter((id) => !have.has(id)),
    toRemove: [...have].filter((id) => !want.has(id)),
  }
}

function fail(field: CollectionField, message: string): { ok: false; errors: CollectionFieldError[] } {
  return { ok: false, errors: [{ field, message }] }
}

async function guard<T extends object>(
  run: () => Promise<CollectionResult<T>>,
): Promise<CollectionResult<T>> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CollectionStoreError) {
      if (error.kind === 'unavailable') return fail('collection', MESSAGES.unavailable)
      if (error.kind === 'limit') return fail('limit', MESSAGES.limit)
    }
    return fail('collection', MESSAGES.unexpected)
  }
}

export function createCollectionsService(store: CollectionStore) {
  return {
    create(projectId: string, rawName: string) {
      return guard<{ collection: OwnerCollection }>(async () => {
        const existing = await store.list(projectId)
        if (existing.length >= MAX_COLLECTIONS) return fail('limit', MESSAGES.limit)
        const checked = validateCollectionName(rawName, existing)
        if (!checked.ok) return { ok: false, errors: [checked.error] }

        const taken = new Set(existing.map((c) => c.slug))
        const sortOrder = existing.reduce((max, c) => Math.max(max, c.sort_order), -1) + 1
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const slug = uniqueCollectionSlug(checked.name, taken)
          try {
            const collection = await store.insert(projectId, {
              name: checked.name,
              slug,
              sort_order: sortOrder,
            })
            return { ok: true, collection }
          } catch (error) {
            if (error instanceof CollectionStoreError && error.kind === 'slug_taken') {
              taken.add(slug)
              continue
            }
            throw error
          }
        }
        return fail('name', MESSAGES.unexpected)
      })
    },

    /** The slug stays put on rename so home sections that point at it keep working. */
    rename(projectId: string, id: string, rawName: string) {
      return guard(async () => {
        const existing = await store.list(projectId)
        if (!existing.some((c) => c.id === id)) return fail('collection', MESSAGES.notFound)
        const checked = validateCollectionName(rawName, existing, id)
        if (!checked.ok) return { ok: false, errors: [checked.error] }
        await store.update(projectId, id, { name: checked.name })
        return { ok: true }
      })
    },

    reorder(projectId: string, orderedIds: string[]) {
      return guard(async () => {
        const existing = await store.list(projectId)
        const ids = dedupeIds(orderedIds)
        const known = new Set(existing.map((c) => c.id))
        if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
          return fail('collection', MESSAGES.notFound)
        }
        await store.setSortOrders(projectId, ids)
        return { ok: true }
      })
    },

    remove(projectId: string, id: string) {
      return guard(async () => {
        const existing = await store.list(projectId)
        if (!existing.some((c) => c.id === id)) return fail('collection', MESSAGES.notFound)
        await store.remove(projectId, id)
        return { ok: true }
      })
    },

    setAutoBestSellers(projectId: string, id: string, enabled: boolean) {
      return guard(async () => {
        const existing = await store.list(projectId)
        if (!existing.some((c) => c.id === id)) return fail('collection', MESSAGES.notFound)
        await store.update(projectId, id, { auto_best_sellers: enabled === true })
        return { ok: true }
      })
    },

    setProducts(projectId: string, id: string, productIds: string[]) {
      return guard(async () => {
        const existing = await store.list(projectId)
        if (!existing.some((c) => c.id === id)) return fail('collection', MESSAGES.notFound)
        const ids = dedupeIds(productIds)
        if (ids.length > MAX_PRODUCTS_PER_COLLECTION) return fail('products', MESSAGES.tooManyProducts)
        const owned = await store.projectProductIds(projectId, ids)
        if (owned.length !== ids.length) return fail('products', MESSAGES.foreignProducts)
        await store.replaceMembers(projectId, id, ids)
        return { ok: true }
      })
    },

    setProductCollections(projectId: string, productId: string, collectionIds: string[]) {
      return guard(async () => {
        const owned = await store.projectProductIds(projectId, [productId])
        if (owned.length !== 1) return fail('products', MESSAGES.foreignProducts)
        const existing = await store.list(projectId)
        const known = new Set(existing.map((c) => c.id))
        const ids = dedupeIds(collectionIds)
        if (!ids.every((id) => known.has(id))) return fail('collection', MESSAGES.notFound)
        await store.replaceProductCollections(projectId, productId, ids)
        return { ok: true }
      })
    },
  }
}
