/**
 * Logo marks — generated locally, with ZERO AI credit usage.
 * ---------------------------------------------------------
 * The editor lets the site owner either regenerate the brand mark or upload
 * their own file. Regeneration is fully deterministic and offline: the mark is
 * an inline SVG built from the brand initials plus the site's own palette, so
 * "refresh logo" costs nothing and works even when the AI Gateway is down.
 *
 * Uploads are normalised in the browser (see `scaleLogoUpload`) so an oversized
 * photo can never bloat the saved schema.
 */

/** Recommended pixel box for an uploaded logo (square mark or wordmark). */
export const LOGO_MAX_SIZE = 512
/** Hard cap on the height of a normalised logo, keeps the header tidy. */
export const LOGO_MAX_HEIGHT = 256
/** How many deterministic mark styles the "refresh" button cycles through. */
export const LOGO_VARIANT_COUNT = 6

/* -------------------------------------------------------------------------- */
/*  Initials                                                                  */
/* -------------------------------------------------------------------------- */

/** "Gloval Nakliyat" -> "GN", "Kadıköy" -> "KA". Always 1-2 uppercase chars. */
export function logoInitials(name: string): string {
  const words = (name || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'A'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('tr-TR')
  return (words[0][0] + words[1][0]).toLocaleUpperCase('tr-TR')
}

/* -------------------------------------------------------------------------- */
/*  Contrast helper (self-contained so this file stays framework-agnostic)     */
/* -------------------------------------------------------------------------- */

function readableOn(hex: string): string {
  const h = (hex || '#000000').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const value = (offset: number) => parseInt(full.slice(offset, offset + 2), 16) / 255
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const l =
    0.2126 * channel(value(0) || 0) +
    0.7152 * channel(value(2) || 0) +
    0.0722 * channel(value(4) || 0)
  return l > 0.5 ? '#0b0b0f' : '#ffffff'
}

/* -------------------------------------------------------------------------- */
/*  Mark builder                                                              */
/* -------------------------------------------------------------------------- */

export type LogoMarkOptions = {
  /** Brand name — only its initials are drawn. */
  name: string
  primary: string
  accent: string
  /** Which of the LOGO_VARIANT_COUNT styles to draw. Wraps around. */
  variant?: number
}

/**
 * Builds a crisp, self-contained SVG brand mark and returns it as a data URI
 * that can be dropped straight into `navigation.logo.src`.
 */
export function buildLogoMark({ name, primary, accent, variant = 0 }: LogoMarkOptions): string {
  const initials = logoInitials(name)
  const v = ((variant % LOGO_VARIANT_COUNT) + LOGO_VARIANT_COUNT) % LOGO_VARIANT_COUNT
  const onPrimary = readableOn(primary)
  const onAccent = readableOn(accent)
  const size = 128
  const fontSize = initials.length > 1 ? 52 : 64
  const label = (fill: string) =>
    `<text x="64" y="64" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Inter, Segoe UI, system-ui, -apple-system, sans-serif" ` +
    `font-size="${fontSize}" font-weight="700" letter-spacing="-1" fill="${fill}">${escapeXml(
      initials,
    )}</text>`

  let body: string
  switch (v) {
    case 0:
      // Solid rounded square
      body = `<rect width="128" height="128" rx="28" fill="${primary}"/>${label(onPrimary)}`
      break
    case 1:
      // Outlined circle
      body =
        `<circle cx="64" cy="64" r="58" fill="none" stroke="${primary}" stroke-width="8"/>` +
        label(primary)
      break
    case 2:
      // Filled circle in the accent color
      body = `<circle cx="64" cy="64" r="64" fill="${accent}"/>${label(onAccent)}`
      break
    case 3:
      // Two-tone diagonal split
      body =
        `<rect width="128" height="128" rx="24" fill="${primary}"/>` +
        `<path d="M128 0 L128 128 L0 128 Z" fill="${accent}"/>` +
        label(onPrimary)
      break
    case 4:
      // Notched badge (one squared corner)
      body =
        `<path d="M0 28 A28 28 0 0 1 28 0 H128 V100 A28 28 0 0 1 100 128 H0 Z" fill="${primary}"/>` +
        label(onPrimary)
      break
    default:
      // Bare monogram with an accent underline
      body =
        label(primary) +
        `<rect x="34" y="104" width="60" height="10" rx="5" fill="${accent}"/>`
      break
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" role="img">${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* -------------------------------------------------------------------------- */
/*  Upload normalisation (browser only)                                       */
/* -------------------------------------------------------------------------- */

/** Target logo box (px). Rendered at 2x for sharpness; ratio stays 4.5:1. */
export const LOGO_TARGET_WIDTH = 180
export const LOGO_TARGET_HEIGHT = 40

/**
 * Normalises an AI-generated logo into a 180x40 (4.5:1) canvas:
 * a flat, opaque background (detected from the four corners) is keyed out to
 * transparency, the artwork is trimmed to its content box, then fitted inside
 * the canvas with its aspect ratio preserved. Browser only.
 *
 * Rejects when the image cannot be decoded or has no visible content, so the
 * caller can surface a real failure instead of saving a blank logo.
 */
export function fitLogoToCanvas(dataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => reject(new Error('logo_decode_failed'))
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return reject(new Error('logo_empty'))

        const src = document.createElement('canvas')
        src.width = w
        src.height = h
        const sctx = src.getContext('2d', { willReadFrequently: true })
        if (!sctx) return reject(new Error('logo_no_canvas'))
        sctx.drawImage(img, 0, 0)
        const { data } = sctx.getImageData(0, 0, w, h)

        const px = (x: number, y: number) => {
          const i = (y * w + x) * 4
          return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const
        }
        const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)]
        const dist = (a: readonly number[], b: readonly number[]) =>
          Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
        const opaque = corners.every((c) => c[3] > 240)
        const flat = opaque && corners.every((c) => dist(c, corners[0]) < 48)
        const bg = corners[0]
        const tolerance = 60

        let minX = w
        let minY = h
        let maxX = -1
        let maxY = -1
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            if (flat && dist([data[i], data[i + 1], data[i + 2]], bg) < tolerance) {
              data[i + 3] = 0
              continue
            }
            if (data[i + 3] < 24) continue
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        if (maxX < 0 || maxY < 0) return reject(new Error('logo_blank'))

        sctx.putImageData(new ImageData(data, w, h), 0, 0)
        const cw = maxX - minX + 1
        const ch = maxY - minY + 1

        const out = document.createElement('canvas')
        out.width = LOGO_TARGET_WIDTH * 2
        out.height = LOGO_TARGET_HEIGHT * 2
        const octx = out.getContext('2d')
        if (!octx) return reject(new Error('logo_no_canvas'))
        const scale = Math.min(out.width / cw, out.height / ch)
        const dw = Math.round(cw * scale)
        const dh = Math.round(ch * scale)
        octx.imageSmoothingQuality = 'high'
        octx.drawImage(
          src,
          minX,
          minY,
          cw,
          ch,
          Math.round((out.width - dw) / 2),
          Math.round((out.height - dh) / 2),
          dw,
          dh,
        )
        resolve(out.toDataURL('image/png'))
      } catch (err) {
        reject(err instanceof Error ? err : new Error('logo_fit_failed'))
      }
    }
    img.src = dataUri
  })
}

/**
 * Auto-scales an uploaded logo so it always lands in the schema at a sane size.
 *
 * - SVG uploads pass through untouched (vector art needs no resizing).
 * - Raster uploads are drawn onto a canvas that fits inside
 *   `LOGO_MAX_SIZE x LOGO_MAX_HEIGHT` with the aspect ratio preserved, and are
 *   re-encoded as PNG so transparency survives.
 *
 * Never throws: if anything about the file is unreadable the original data URI
 * is returned, so the upload still works.
 */
export function scaleLogoUpload(dataUri: string): Promise<string> {
  if (!dataUri.startsWith('data:image/') || dataUri.startsWith('data:image/svg+xml')) {
    return Promise.resolve(dataUri)
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      if (!w || !h) return resolve(dataUri)

      const scale = Math.min(1, LOGO_MAX_SIZE / w, LOGO_MAX_HEIGHT / h)
      const width = Math.max(1, Math.round(w * scale))
      const height = Math.max(1, Math.round(h * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(dataUri)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(dataUri)
      }
    }
    img.onerror = () => resolve(dataUri)
    img.src = dataUri
  })
}
