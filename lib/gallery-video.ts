/**
 * Strict gallery video address check.
 *
 * Only these shapes are accepted, always on the exact host (never a suffix or a
 * substring match, so `youtube.com.evil.com`, `youtube.com@evil.com` and
 * `evil.com/youtube.com` are all rejected):
 *   youtube.com/watch?v=ID · youtu.be/ID · youtube.com/shorts/ID ·
 *   youtube.com/embed/ID · youtube-nocookie.com/embed/ID · vimeo.com/ID
 *
 * Leaf module (imports nothing) so the schema, the edit operations and the UI can share it.
 */

export const GALLERY_VIDEO_URL_MAX = 300

export type GalleryVideoProvider = 'youtube' | 'vimeo'

export type GalleryVideoRef = {
  provider: GalleryVideoProvider
  videoId: string
  /** Canonical public page of the video. */
  watchUrl: string
  /** Privacy-friendly player address; to be loaded only after a visitor clicks play. */
  embedUrl: string
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{1,12}$/
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f\\]/

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YOUTUBE_NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com'])
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com'])

function youtube(videoId: string): GalleryVideoRef {
  return {
    provider: 'youtube',
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
  }
}

function vimeo(videoId: string): GalleryVideoRef {
  return {
    provider: 'vimeo',
    videoId,
    watchUrl: `https://vimeo.com/${videoId}`,
    embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
  }
}

/** Parses a pasted video address. Returns null for anything that is not an accepted shape. */
export function parseGalleryVideoUrl(raw: string | null | undefined): GalleryVideoRef | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > GALLERY_VIDEO_URL_MAX) return null
  if (CONTROL_OR_SPACE.test(text)) return null

  // A pasted "youtube.com/..." without a scheme is read as https.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text.replace(/^\/\//, '')}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password || url.port) return null

  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') {
    return parts.length === 1 && YOUTUBE_ID.test(parts[0]) ? youtube(parts[0]) : null
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (parts.length === 1 && parts[0] === 'watch') {
      const id = url.searchParams.get('v')
      return id && YOUTUBE_ID.test(id) ? youtube(id) : null
    }
    if (parts.length === 2 && (parts[0] === 'shorts' || parts[0] === 'embed') && YOUTUBE_ID.test(parts[1])) {
      return youtube(parts[1])
    }
    return null
  }
  if (YOUTUBE_NOCOOKIE_HOSTS.has(host)) {
    return parts.length === 2 && parts[0] === 'embed' && YOUTUBE_ID.test(parts[1]) ? youtube(parts[1]) : null
  }
  if (VIMEO_HOSTS.has(host)) {
    return parts.length === 1 && VIMEO_ID.test(parts[0]) ? vimeo(parts[0]) : null
  }
  return null
}

export function isGalleryVideoUrl(raw: string | null | undefined): boolean {
  return parseGalleryVideoUrl(raw) !== null
}
