import sharp from 'sharp'
import { PRODUCT_IMAGE_LIMITS } from '@/lib/product-images'

export type ProcessedImage =
  | { ok: true; buffer: Buffer; width: number; height: number; contentType: 'image/webp' }
  | { ok: false; error: 'too_large' | 'unsupported_type' | 'corrupt' }

/** Real file type from the leading bytes — the extension and client MIME are never trusted. */
export function sniffImageType(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}

/**
 * Validates and re-encodes an uploaded product photo:
 * size check, magic-byte type check, EXIF orientation applied then ALL metadata
 * (EXIF/GPS/ICC) dropped by the re-encode, long edge capped at 2000 px, webp output.
 */
export async function processProductImage(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.length === 0 || bytes.length > PRODUCT_IMAGE_LIMITS.maxBytes) {
    return { ok: false, error: 'too_large' }
  }
  if (!sniffImageType(bytes)) return { ok: false, error: 'unsupported_type' }

  try {
    const { data, info } = await sharp(Buffer.from(bytes), {
      failOn: 'error',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: PRODUCT_IMAGE_LIMITS.maxEdge,
        height: PRODUCT_IMAGE_LIMITS.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    return { ok: true, buffer: data, width: info.width, height: info.height, contentType: 'image/webp' }
  } catch {
    return { ok: false, error: 'corrupt' }
  }
}
