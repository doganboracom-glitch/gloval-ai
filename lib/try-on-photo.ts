/**
 * Client-side preparation of the buyer's photo for `/api/try-on`.
 *
 * Vercel Functions reject request bodies over 4.5MB with a non-JSON 413, which
 * the client can only report as a generic error. Phone photos are routinely
 * 3-12MB, so the photo is downscaled and re-encoded as JPEG before upload.
 * The size/quality search lives here, free of DOM access, so it can be unit
 * tested; only `compressPhotoFile` touches the browser.
 */

export const TRY_ON_MAX_EDGE = 1536
export const TRY_ON_JPEG_QUALITY = 0.85

/**
 * Budget for the base64 data URL (its string length is what goes over the
 * wire). Leaves ~1MB of the 4.5MB platform limit for the rest of the JSON body.
 */
export const TRY_ON_MAX_DATA_URL_CHARS = 3_500_000

const FALLBACK_EDGES = [TRY_ON_MAX_EDGE, 1280, 1024, 768, 512]
const FALLBACK_QUALITIES = [TRY_ON_JPEG_QUALITY, 0.7, 0.55]

export class PhotoTooLargeError extends Error {
  constructor() {
    super('photo_too_large')
    this.name = 'PhotoTooLargeError'
  }
}

export type PhotoRenderer = (width: number, height: number, quality: number) => string | Promise<string>

/** Scales (width, height) down so the longer edge is at most `maxEdge`; never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  const scale = longest > maxEdge ? maxEdge / longest : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Encodes the image at the default edge/quality first and only falls back to
 * smaller sizes and lower quality when the result would exceed the budget.
 * Throws `PhotoTooLargeError` when even the smallest attempt does not fit.
 */
export async function encodePhotoWithinBudget(
  naturalWidth: number,
  naturalHeight: number,
  render: PhotoRenderer,
  maxChars: number = TRY_ON_MAX_DATA_URL_CHARS,
): Promise<string> {
  for (const edge of FALLBACK_EDGES) {
    const { width, height } = fitWithin(naturalWidth, naturalHeight, edge)
    for (const quality of FALLBACK_QUALITIES) {
      const dataUrl = await render(width, height, quality)
      if (dataUrl.length <= maxChars) return dataUrl
    }
  }
  throw new PhotoTooLargeError()
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image_decode_failed'))
    }
    img.src = url
  })
}

export async function compressPhotoFile(file: File): Promise<string> {
  const img = await loadImage(file)
  return encodePhotoWithinBudget(img.naturalWidth, img.naturalHeight, (width, height, quality) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas_unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  })
}
