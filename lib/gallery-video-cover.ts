import { parseGalleryVideoUrl } from '@/lib/gallery-video'

/**
 * Server-side YouTube thumbnail download. The owner's browser never talks to YouTube: the server fetches
 * the still, stores it with the site's own images and only the stored URL ends up in the schema.
 * Vimeo has no keyless thumbnail endpoint, so it simply yields no cover (the themed fallback card is used).
 */

export const COVER_MAX_BYTES = 2 * 1024 * 1024
const THUMBNAIL_HOST = 'https://i.ytimg.com/vi'
const THUMBNAIL_FILES = ['maxresdefault.jpg', 'hqdefault.jpg'] as const
const TIMEOUT_MS = 8000

export type CoverDeps = {
  fetchImpl?: typeof fetch
  persist: (dataUri: string) => Promise<string>
}

/** `{ src }` for a stored cover, or `null` when the thumbnail could not be fetched or stored. */
export async function fetchGalleryVideoCover(url: string, deps: CoverDeps): Promise<{ src: string } | null> {
  const ref = parseGalleryVideoUrl(url)
  if (!ref || ref.provider !== 'youtube') return null
  const doFetch = deps.fetchImpl ?? fetch

  for (const file of THUMBNAIL_FILES) {
    try {
      const res = await doFetch(`${THUMBNAIL_HOST}/${ref.videoId}/${file}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      })
      if (!res.ok) continue
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (type !== 'image/jpeg' && type !== 'image/webp' && type !== 'image/png') continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0 || bytes.length > COVER_MAX_BYTES) continue
      const src = await deps.persist(`data:${type};base64,${bytes.toString('base64')}`)
      return src ? { src } : null
    } catch {
      continue
    }
  }
  return null
}
