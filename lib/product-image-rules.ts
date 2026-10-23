import { isUsableImageSrc } from '@/lib/about-media'
import { PRODUCT_IMAGES_MAX } from '@/lib/list-limits'
import type { WebsiteSchema } from '@/lib/website-schema'

/** Product photos: PNG, JPG or WebP, at most 5 MB each. */
export const PRODUCT_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_MIME_TYPES.join(',')

export type ProductImageFileError = 'type' | 'size'

export function validateProductImageFile(file: { type: string; size: number }): ProductImageFileError | null {
  if (!(PRODUCT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'size'
  return null
}

export type GalleryImage = { src: string; alt?: string }

/** The editable gallery: the stored images, or the legacy single `src` as its only image. */
export function galleryOf(item: { images?: GalleryImage[]; src?: string; alt?: string }): GalleryImage[] {
  const own = (item.images ?? []).filter((image) => isUsableImageSrc(image.src)).slice(0, PRODUCT_IMAGES_MAX)
  if (own.length > 0) return own
  return isUsableImageSrc(item.src) ? [{ src: item.src, alt: item.alt }] : []
}

/** Moves one image; out-of-range moves return the same order. The first image is the card / cover image. */
export function moveImage<T>(images: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return images
  const next = images.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** A readable alt text when the owner has not written one yet: product name plus the image's position. */
export function suggestProductImageAlt(name: string, position: number, lang: 'tr' | 'en' = 'tr'): string {
  const base = name.trim() || (lang === 'en' ? 'Product' : 'Ürün')
  if (position <= 0) return base
  return lang === 'en' ? `${base} - view ${position + 1}` : `${base} - görünüm ${position + 1}`
}

/** Every image already on the site (any section, any product), unique by source, for "pick from existing images". */
export function collectSiteImages(site: Pick<WebsiteSchema, 'sections'>): { src: string; alt: string }[] {
  const seen = new Set<string>()
  const found: { src: string; alt: string }[] = []
  const add = (src: unknown, alt: unknown) => {
    if (!isUsableImageSrc(src)) return
    const key = src.trim()
    if (seen.has(key)) return
    seen.add(key)
    found.push({ src: key, alt: typeof alt === 'string' ? alt : '' })
  }
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1)
      return
    }
    const record = value as Record<string, unknown>
    if (typeof record.src === 'string') add(record.src, record.alt)
    for (const key of Object.keys(record)) if (typeof record[key] === 'object') visit(record[key], depth + 1)
  }
  for (const section of site.sections ?? []) visit(section, 0)
  return found
}
