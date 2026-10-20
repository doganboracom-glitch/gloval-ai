/**
 * Upload rules for blog images, shared by the browser (pre-flight) and the
 * server (which is the one that actually enforces them).
 *
 * Only PNG, JPEG and WebP are accepted, at most 5 MB. SVG is refused on
 * purpose: it can carry script. File names are always random and the extension
 * comes from the sniffed format, never from what the client called the file.
 */

export const BLOG_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const BLOG_UPLOAD_PREFIX = 'blog'

export const BLOG_UPLOAD_TYPES: Record<string, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export type UploadError = 'invalid_input' | 'too_large' | 'unsupported_type'

export type ImageKind = { mime: string; ext: 'png' | 'jpg' | 'webp' }

/** Cheap check on what the client says it will upload, before any bytes move. */
export function validateUploadDeclaration(input: {
  size: unknown
  mime: unknown
}): { ok: true; kind: ImageKind } | { ok: false; error: UploadError } {
  const size = typeof input.size === 'number' ? input.size : NaN
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'invalid_input' }
  if (size > BLOG_UPLOAD_MAX_BYTES) return { ok: false, error: 'too_large' }
  const mime = typeof input.mime === 'string' ? input.mime.toLowerCase() : ''
  const ext = BLOG_UPLOAD_TYPES[mime]
  if (!ext) return { ok: false, error: 'unsupported_type' }
  return { ok: true, kind: { mime, ext } }
}

/** Identify the real format from magic bytes; a declared MIME type is never trusted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b)
  if (bytes.length > 12 && startsWith([0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes.length > 8 && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' }
  if (bytes.length > 12 && startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

/** Full check on the uploaded bytes: size and real format. */
export function inspectUpload(bytes: Uint8Array): { ok: true; kind: ImageKind } | { ok: false; error: UploadError } {
  if (bytes.length === 0) return { ok: false, error: 'invalid_input' }
  if (bytes.length > BLOG_UPLOAD_MAX_BYTES) return { ok: false, error: 'too_large' }
  const kind = sniffImage(bytes)
  return kind ? { ok: true, kind } : { ok: false, error: 'unsupported_type' }
}

export function randomBlogImagePath(ext: ImageKind['ext'], id: string = crypto.randomUUID()): string {
  return `${BLOG_UPLOAD_PREFIX}/${id}.${ext}`
}

/** Only objects this feature created can be listed or deleted through it. */
export const BLOG_IMAGE_PATH = /^blog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/

export function isBlogImagePath(path: unknown): path is string {
  return typeof path === 'string' && BLOG_IMAGE_PATH.test(path)
}
