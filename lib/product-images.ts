/**
 * Product gallery rules shared by the owner form, server actions and storefront.
 *
 * `ecommerce_products.images` is jsonb. It used to hold plain URL strings; it now
 * holds `{ url, alt }` items. Both shapes are read (`normalizeProductImages`), only
 * the new one is written, so existing single-image products keep working untouched.
 */

export const PRODUCT_IMAGE_LIMITS = {
  maxCount: 8,
  maxBytes: 5 * 1024 * 1024,
  maxAlt: 125,
  maxEdge: 2000,
} as const

export const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ProductImage = { url: string; alt: string }

export type ProductImageErrorCode = 'INVALID_IMAGES' | 'INVALID_IMAGE_URL'

/** `products/<projectId>/<fileId>.webp` — the only shape the uploader ever writes. */
const OWN_PATH_RE = /^products\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function productImagePath(projectId: string, fileId: string): string {
  return `products/${projectId}/${fileId}.webp`
}

/**
 * Lenient read of whatever is stored: `string[]`, `{url, alt}[]`, a mix, or the
 * same serialized as a JSON string. Anything unusable is skipped, never thrown.
 */
export function normalizeProductImages(raw: unknown): ProductImage[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []

  const out: ProductImage[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      if (item) out.push({ url: item, alt: '' })
    } else if (item && typeof item === 'object') {
      const { url, alt } = item as { url?: unknown; alt?: unknown }
      if (typeof url === 'string' && url) {
        out.push({ url, alt: typeof alt === 'string' ? alt : '' })
      }
    }
  }
  return out
}

/** Gallery for display: new `gallery` when present, else the legacy URL list. */
export function getProductGallery(product: {
  gallery?: ProductImage[] | null
  images?: unknown
}): ProductImage[] {
  if (product.gallery && product.gallery.length > 0) return product.gallery
  return normalizeProductImages(product.images)
}

/**
 * Strict write-side parse. Throws `INVALID_IMAGES` for a malformed list, more
 * than the maximum, or an alt text that is too long / contains markup.
 * Order is preserved: the first image is the cover.
 */
export function parseProductImagesInput(raw: unknown): ProductImage[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new Error('INVALID_IMAGES')
  if (raw.length > PRODUCT_IMAGE_LIMITS.maxCount) throw new Error('INVALID_IMAGES')

  const seen = new Set<string>()
  const out: ProductImage[] = []
  for (const item of raw) {
    let url: unknown
    let alt: unknown = ''
    if (typeof item === 'string') {
      url = item
    } else if (item && typeof item === 'object') {
      ;({ url, alt = '' } = item as { url?: unknown; alt?: unknown })
    } else {
      throw new Error('INVALID_IMAGES')
    }
    if (typeof url !== 'string' || !url.trim()) throw new Error('INVALID_IMAGES')
    if (typeof alt !== 'string') throw new Error('INVALID_IMAGES')
    const cleanAlt = alt.trim()
    if (cleanAlt.length > PRODUCT_IMAGE_LIMITS.maxAlt || /[<>]/.test(cleanAlt)) {
      throw new Error('INVALID_IMAGES')
    }
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, alt: cleanAlt })
  }
  return out
}

/** Returns the storage path for a URL inside OUR bucket's product folder, else null. */
export function storagePathFromUrl(url: string, storageBase: string | null): string | null {
  if (!storageBase || !url.startsWith(storageBase)) return null
  const path = url.slice(storageBase.length)
  return OWN_PATH_RE.test(path) ? path : null
}

export function projectIdFromPath(path: string): string | null {
  const match = OWN_PATH_RE.exec(path)
  return match ? match[1].toLowerCase() : null
}

export function isOwnProjectImage(url: string, projectId: string, storageBase: string | null): boolean {
  const path = storagePathFromUrl(url, storageBase)
  return path !== null && projectIdFromPath(path) === projectId.toLowerCase()
}

/**
 * Decides which image URLs may be stored on a product of `projectId`.
 *
 * Accepted: files uploaded to THIS project's folder in our own bucket, and URLs
 * the product already had (site-schema sync, demo assets, earlier uploads), so
 * re-saving never breaks them. Everything else — arbitrary external URLs and any
 * other project's files — is rejected with `INVALID_IMAGE_URL`.
 *
 * `removedPaths` lists this project's uploaded files that the product no longer
 * references; callers delete them only if no other product still uses them.
 */
export function prepareProductImagesForSave(input: {
  images: ProductImage[]
  projectId: string
  storageBase: string | null
  existingUrls: string[]
}): { images: ProductImage[]; removedPaths: string[] } {
  const { images, projectId, storageBase, existingUrls } = input
  const existing = new Set(existingUrls)

  for (const image of images) {
    if (!existing.has(image.url) && !isOwnProjectImage(image.url, projectId, storageBase)) {
      throw new Error('INVALID_IMAGE_URL')
    }
  }

  const kept = new Set(images.map((image) => image.url))
  const removedPaths: string[] = []
  for (const url of existing) {
    if (kept.has(url)) continue
    const path = storagePathFromUrl(url, storageBase)
    if (path && projectIdFromPath(path) === projectId.toLowerCase()) removedPaths.push(path)
  }
  return { images, removedPaths }
}
