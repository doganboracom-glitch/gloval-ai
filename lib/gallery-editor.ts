import { isUsableImageSrc } from '@/lib/about-media'
import { GALLERY_IMAGES_MAX } from '@/lib/list-limits'
import { albumKey, type GallerySection } from '@/lib/gallery-albums'

/**
 * Editor-side rules for the gallery section: what an uploaded photo must look like, how several photos are
 * added in one go, and the alt text every photo needs. Pure, so the editor and the edit operations share it.
 */

export const GALLERY_UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const GALLERY_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const GALLERY_UPLOAD_ACCEPT = GALLERY_UPLOAD_MIME_TYPES.join(',')
export const GALLERY_RECOMMENDED_SIZE = { width: 1600, height: 1200 } as const

export type GalleryUploadProblem = 'type' | 'size'

export function validateGalleryUpload(file: { type: string; size: number }): GalleryUploadProblem | null {
  if (!(GALLERY_UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > GALLERY_UPLOAD_MAX_BYTES) return 'size'
  return null
}

/** Splits a multi-file pick into the files that may be uploaded and the ones refused (with the reason). */
export function sortGalleryUploads<T extends { type: string; size: number; name?: string }>(
  files: readonly T[],
  room: number,
): { accepted: T[]; rejected: { file: T; problem: GalleryUploadProblem | 'full' }[] } {
  const accepted: T[] = []
  const rejected: { file: T; problem: GalleryUploadProblem | 'full' }[] = []
  for (const file of files) {
    const problem = validateGalleryUpload(file)
    if (problem) rejected.push({ file, problem })
    else if (accepted.length >= Math.max(0, room)) rejected.push({ file, problem: 'full' })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

/** A readable alt text for a photo that has none yet: the business (or album) name plus its position. */
export function suggestGalleryAlt(
  context: { businessName?: string; album?: string },
  position: number,
  lang: 'tr' | 'en' = 'tr',
): string {
  const base =
    (context.album?.trim() && `${context.businessName?.trim() ? `${context.businessName.trim()} - ` : ''}${context.album.trim()}`) ||
    context.businessName?.trim() ||
    (lang === 'en' ? 'Gallery photo' : 'Galeri fotoğrafı')
  return lang === 'en' ? `${base} - photo ${position + 1}` : `${base} - fotoğraf ${position + 1}`
}

export function isGalleryAltMissing(item: { alt?: string }): boolean {
  return !item.alt || !item.alt.trim()
}

export type GalleryUploadInput = { src: string; alt?: string; album?: string }

export type AddGalleryImagesResult = { section: GallerySection; added: number; skipped: number }

/**
 * Appends several uploaded photos at once. Photos beyond the 60-image limit are skipped, an album that
 * does not exist falls back to "Genel", and an empty alt gets the suggested text. Uploaded photos carry
 * no `imagePrompt`.
 */
export function addGalleryImages(
  section: GallerySection,
  images: readonly GalleryUploadInput[],
  context: { businessName?: string; lang?: 'tr' | 'en' } = {},
): AddGalleryImagesResult {
  const albums = section.albums ?? []
  const items = [...section.items]
  let added = 0
  for (const image of images) {
    if (!isUsableImageSrc(image.src) || items.length >= GALLERY_IMAGES_MAX) continue
    const target = image.album ? albums.find((a) => albumKey(a.name) === albumKey(image.album)) : undefined
    const alt =
      image.alt?.trim() ||
      suggestGalleryAlt({ businessName: context.businessName, album: target?.name }, items.length, context.lang)
    items.push({ src: image.src.trim(), alt, ...(target ? { album: target.name } : {}) })
    added += 1
  }
  return { section: added ? { ...section, items } : section, added, skipped: images.length - added }
}
