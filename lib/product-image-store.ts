import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET, ensureBucket } from '@/lib/image-storage'
import { normalizeProductImages } from '@/lib/product-images'
import type { CleanupDeps, ImageStore } from '@/lib/product-image-service'

/** Public URL prefix of the shared image bucket, derived from env only (no network). */
export function getProductImageStorageBase(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!url) return null
  return `${url.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/`
}

/** Product photos live in the existing public `site-images` bucket under `products/<projectId>/`. */
export function createProductImageStore(): ImageStore {
  const storageBase = getProductImageStorageBase()
  let ready = false

  return {
    storageBase,
    async upload(path, bytes, contentType) {
      try {
        const client = createAdminClient()
        if (!ready) {
          await ensureBucket(client)
          ready = true
        }
        const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        })
        return error ? { error: error.message } : {}
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'upload_failed' }
      }
    },
    async remove(paths) {
      try {
        const { error } = await createAdminClient().storage.from(BUCKET).remove(paths)
        return error ? { error: error.message } : {}
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'remove_failed' }
      }
    },
    publicUrl(path) {
      return createAdminClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    },
  }
}

export function createProductImageCleanupDeps(): CleanupDeps {
  const store = createProductImageStore()
  return {
    store,
    async listReferencedUrls(projectId) {
      const { data, error } = await createAdminClient()
        .from('ecommerce_products')
        .select('images')
        .eq('project_id', projectId)
      if (error) throw error
      return (data ?? []).flatMap((row) => normalizeProductImages(row.images).map((i) => i.url))
    },
  }
}
