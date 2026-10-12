'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { isMissingTableError } from '@/lib/store-schema-compat'
import { revalidateStorefront } from '@/lib/store-revalidate'
import {
  CollectionStoreError,
  createCollectionsService,
  diffIds,
  type CollectionResult,
  type CollectionStore,
  type OwnerCollection,
} from '@/lib/store-collections-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DbError = { code?: string | null; message?: string | null } | null

function raise(error: DbError): never {
  if (isMissingTableError(error)) throw new CollectionStoreError('unavailable')
  if (error?.code === '23505') throw new CollectionStoreError('slug_taken')
  if (/collection_limit_reached/.test(error?.message ?? '')) throw new CollectionStoreError('limit')
  throw new Error(error?.message ?? 'collections_db_error')
}

/** Service-role store. Every query is filtered by `project_id`; callers must authorize first. */
function createAdminCollectionStore(): CollectionStore {
  const db = createAdminClient()

  const store: CollectionStore = {
    async list(projectId) {
      const [collections, members] = await Promise.all([
        db
          .from('ecommerce_collections')
          .select('id, name, slug, sort_order, auto_best_sellers')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        db
          .from('ecommerce_product_collections')
          .select('collection_id, product_id')
          .eq('project_id', projectId),
      ])
      if (collections.error) raise(collections.error)
      if (members.error) raise(members.error)

      const byCollection = new Map<string, string[]>()
      for (const row of members.data ?? []) {
        const list = byCollection.get(row.collection_id as string) ?? []
        list.push(row.product_id as string)
        byCollection.set(row.collection_id as string, list)
      }
      return (collections.data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        sort_order: c.sort_order as number,
        auto_best_sellers: c.auto_best_sellers === true,
        product_ids: byCollection.get(c.id as string) ?? [],
      }))
    },

    async insert(projectId, row) {
      const { data, error } = await db
        .from('ecommerce_collections')
        .insert({ project_id: projectId, ...row })
        .select('id, name, slug, sort_order, auto_best_sellers')
        .single()
      if (error || !data) raise(error)
      return {
        id: data.id as string,
        name: data.name as string,
        slug: data.slug as string,
        sort_order: data.sort_order as number,
        auto_best_sellers: data.auto_best_sellers === true,
        product_ids: [],
      }
    },

    async update(projectId, id, patch) {
      const { error } = await db
        .from('ecommerce_collections')
        .update(patch)
        .eq('id', id)
        .eq('project_id', projectId)
      if (error) raise(error)
    },

    async setSortOrders(projectId, orderedIds) {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await db
          .from('ecommerce_collections')
          .update({ sort_order: index })
          .eq('id', id)
          .eq('project_id', projectId)
        if (error) raise(error)
      }
    },

    async remove(projectId, id) {
      const { error } = await db
        .from('ecommerce_collections')
        .delete()
        .eq('id', id)
        .eq('project_id', projectId)
      if (error) raise(error)
    },

    async projectProductIds(projectId, ids) {
      if (ids.length === 0) return []
      const { data, error } = await db
        .from('ecommerce_products')
        .select('id')
        .eq('project_id', projectId)
        .in('id', ids)
      if (error) raise(error)
      return (data ?? []).map((p) => p.id as string)
    },

    async replaceMembers(projectId, collectionId, productIds) {
      const { data, error } = await db
        .from('ecommerce_product_collections')
        .select('product_id')
        .eq('project_id', projectId)
        .eq('collection_id', collectionId)
      if (error) raise(error)
      const { toAdd, toRemove } = diffIds(
        (data ?? []).map((r) => r.product_id as string),
        productIds,
      )
      if (toAdd.length > 0) {
        const { error: insertError } = await db.from('ecommerce_product_collections').upsert(
          toAdd.map((product_id) => ({ project_id: projectId, collection_id: collectionId, product_id })),
          { onConflict: 'collection_id,product_id', ignoreDuplicates: true },
        )
        if (insertError) raise(insertError)
      }
      if (toRemove.length > 0) {
        const { error: deleteError } = await db
          .from('ecommerce_product_collections')
          .delete()
          .eq('project_id', projectId)
          .eq('collection_id', collectionId)
          .in('product_id', toRemove)
        if (deleteError) raise(deleteError)
      }
    },

    async replaceProductCollections(projectId, productId, collectionIds) {
      const { data, error } = await db
        .from('ecommerce_product_collections')
        .select('collection_id')
        .eq('project_id', projectId)
        .eq('product_id', productId)
      if (error) raise(error)
      const { toAdd, toRemove } = diffIds(
        (data ?? []).map((r) => r.collection_id as string),
        collectionIds,
      )
      if (toAdd.length > 0) {
        const { error: insertError } = await db.from('ecommerce_product_collections').upsert(
          toAdd.map((collection_id) => ({ project_id: projectId, collection_id, product_id: productId })),
          { onConflict: 'collection_id,product_id', ignoreDuplicates: true },
        )
        if (insertError) raise(insertError)
      }
      if (toRemove.length > 0) {
        const { error: deleteError } = await db
          .from('ecommerce_product_collections')
          .delete()
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .in('collection_id', toRemove)
        if (deleteError) raise(deleteError)
      }
    },
  }
  return store
}

const NOT_ALLOWED = {
  ok: false as const,
  errors: [{ field: 'collection' as const, message: 'Bu mağazaya erişimin yok.' }],
}

async function authorized(projectId: string): Promise<boolean> {
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return false
  try {
    await authorizeProjectOwner(projectId)
    return true
  } catch {
    return false
  }
}

/** Home showcase, store list and product pages all read collections; refresh the whole tree. */
function refreshSite(projectId: string) {
  return revalidateStorefront(
    {
      findSlug: async (id) => {
        const { data } = await createAdminClient()
          .from('projects')
          .select('slug')
          .eq('id', id)
          .maybeSingle()
        return typeof data?.slug === 'string' && data.slug ? data.slug : null
      },
      revalidatePath,
    },
    projectId,
  )
}

async function mutate<T extends object>(
  projectId: string,
  run: (service: ReturnType<typeof createCollectionsService>) => Promise<CollectionResult<T>>,
): Promise<CollectionResult<T>> {
  if (!(await authorized(projectId))) return NOT_ALLOWED
  const result = await run(createCollectionsService(createAdminCollectionStore()))
  if (result.ok) {
    revalidatePath(`/ecommerce/${projectId}`)
    await refreshSite(projectId)
  }
  return result
}

export async function listOwnerCollections(
  projectId: string,
): Promise<{ available: boolean; collections: OwnerCollection[] }> {
  if (!(await authorized(projectId))) return { available: false, collections: [] }
  try {
    return { available: true, collections: await createAdminCollectionStore().list(projectId) }
  } catch {
    return { available: false, collections: [] }
  }
}

export async function createCollection(projectId: string, name: string) {
  return mutate(projectId, (s) => s.create(projectId, name))
}

export async function renameCollection(projectId: string, id: string, name: string) {
  return mutate(projectId, (s) => s.rename(projectId, id, name))
}

export async function reorderCollections(projectId: string, orderedIds: string[]) {
  return mutate(projectId, (s) => s.reorder(projectId, orderedIds))
}

export async function deleteCollection(projectId: string, id: string) {
  return mutate(projectId, (s) => s.remove(projectId, id))
}

export async function setCollectionAutoBestSellers(projectId: string, id: string, enabled: boolean) {
  return mutate(projectId, (s) => s.setAutoBestSellers(projectId, id, enabled))
}

export async function setCollectionProducts(projectId: string, id: string, productIds: string[]) {
  return mutate(projectId, (s) => s.setProducts(projectId, id, productIds))
}

export async function setProductCollections(
  projectId: string,
  productId: string,
  collectionIds: string[],
) {
  return mutate(projectId, (s) => s.setProductCollections(projectId, productId, collectionIds))
}
