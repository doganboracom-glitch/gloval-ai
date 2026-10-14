/**
 * Google Maps embed handling
 * --------------------------
 * The owner pastes the "Share -> Embed a map -> COPY HTML" iframe from Google
 * Maps (or a plain maps link). We never render the pasted markup: we extract the
 * `src`, accept it only when it points at Google's embed endpoint, and draw our
 * own iframe with fixed, safe attributes. Everything else the owner pasted
 * (width/height, style, onload, scripts, other tags) is dropped.
 *
 * Pure functions only, so the same code runs in the editor, on the server and in
 * the renderer (which re-validates stored values defensively).
 */

export type MapParseResult =
  | { kind: 'empty' }
  /** Ready to render; `src` is already validated and normalised. */
  | { kind: 'embed'; src: string }
  /** `maps.app.goo.gl` link: needs a server-side redirect lookup. */
  | { kind: 'short-link'; url: string }
  | { kind: 'invalid'; reason: MapInvalidReason }

export type MapInvalidReason =
  /** Contains a script, `javascript:`/`data:` URL or similar. */
  | 'unsafe'
  /** HTML without a usable iframe `src`, or text that is not a URL. */
  | 'no-src'
  /** A src/link on a domain other than Google Maps. */
  | 'not-google'
  /** A Google Maps link we cannot turn into an embed (e.g. directions). */
  | 'unsupported-link'

const MAX_INPUT_LENGTH = 4000
const MAX_SRC_LENGTH = 2000
const MAX_QUERY_LENGTH = 200

const EMBED_HOST = 'www.google.com'
const LINK_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'maps.google.com',
  'www.google.com.tr',
  'google.com.tr',
])
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl'])

/** True for hosts a pasted maps link may live on (used by the redirect resolver too). */
export function isGoogleMapsLinkHost(host: string): boolean {
  return LINK_HOSTS.has(host.toLowerCase())
}

export function isMapsShortLinkHost(host: string): boolean {
  return SHORT_LINK_HOSTS.has(host.toLowerCase())
}

/**
 * Validates an embed `src`. Returns the normalised URL or null.
 *
 * Accepted: `https://www.google.com/maps/embed...` (what Google hands out) and
 * the keyless `https://www.google.com/maps?...&output=embed` form this module
 * builds itself from plain links and addresses.
 */
export function sanitizeMapSrc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > MAX_SRC_LENGTH) return null
  // Control characters / whitespace inside a URL are never legitimate.
  if (/[\u0000-\u0020\u007f]/.test(value)) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.hostname !== EMBED_HOST) return null
  if (url.username || url.password || url.port) return null

  const isGoogleEmbed = url.pathname === '/maps/embed' || url.pathname.startsWith('/maps/embed/')
  const isKeylessEmbed = url.pathname === '/maps' && url.searchParams.get('output') === 'embed'
  if (!isGoogleEmbed && !isKeylessEmbed) return null

  return url.toString()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&quot;/gi, '"')
}

/** First iframe tag's quoted `src` value, or null. */
function extractIframeSrc(html: string): string | null {
  const tag = html.match(/<iframe\b[^>]*>/i)
  if (!tag) return null
  const attr = tag[0].match(/[\s"']src\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  const value = attr?.[1] ?? attr?.[2]
  return value ? decodeHtmlEntities(value) : null
}

function placeQueryFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean) // ['maps', 'place', 'Name+Here', '@41.0,29.0,15z', ...]
  const kind = segments[1]
  if (kind === 'place' || kind === 'search') {
    const name = segments[2]
    if (name && !name.startsWith('@') && !name.startsWith('data=')) {
      try {
        return decodeURIComponent(name.replace(/\+/g, ' '))
      } catch {
        return null
      }
    }
    const at = segments.find((s) => s.startsWith('@'))
    if (at) return coordsFromAt(at)
    return null
  }
  if (kind?.startsWith('@')) return coordsFromAt(kind)
  return null
}

function coordsFromAt(segment: string): string | null {
  const m = segment.match(/^@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
  return m ? `${m[1]},${m[2]}` : null
}

/** Turns a regular Google Maps link into a keyless embeddable URL. */
function embedFromLink(url: URL): string | null {
  if (!url.pathname.startsWith('/maps')) return null
  if (url.pathname.startsWith('/maps/dir')) return null

  const fromParams =
    url.searchParams.get('q') ?? url.searchParams.get('query') ?? url.searchParams.get('destination')
  const query = (fromParams ?? placeQueryFromPath(url.pathname))?.trim()
  if (!query || query.length > MAX_QUERY_LENGTH) return null
  return buildKeylessEmbed(query)
}

function buildKeylessEmbed(query: string): string {
  const url = new URL(`https://${EMBED_HOST}/maps`)
  url.searchParams.set('q', query)
  url.searchParams.set('output', 'embed')
  return url.toString()
}

/** Classifies whatever the owner pasted into the "map" field. */
export function parseMapInput(raw: string): MapParseResult {
  const input = typeof raw === 'string' ? raw.trim() : ''
  if (!input) return { kind: 'empty' }
  if (input.length > MAX_INPUT_LENGTH) return { kind: 'invalid', reason: 'unsafe' }

  if (/<\s*script\b/i.test(input) || /javascript\s*:/i.test(input) || /\bdata\s*:/i.test(input)) {
    return { kind: 'invalid', reason: 'unsafe' }
  }

  if (input.includes('<')) {
    const src = extractIframeSrc(input)
    if (!src) return { kind: 'invalid', reason: 'no-src' }
    const safe = sanitizeMapSrc(src)
    return safe ? { kind: 'embed', src: safe } : { kind: 'invalid', reason: 'not-google' }
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return { kind: 'invalid', reason: 'no-src' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid', reason: 'unsafe' }
  if (url.username || url.password) return { kind: 'invalid', reason: 'unsafe' }

  const host = url.hostname.toLowerCase()
  if (isMapsShortLinkHost(host)) {
    return { kind: 'short-link', url: `https://${host}${url.pathname}${url.search}` }
  }
  if (!isGoogleMapsLinkHost(host)) return { kind: 'invalid', reason: 'not-google' }

  // A pasted embed URL (without the iframe wrapper) is fine too.
  const direct = sanitizeMapSrc(`https://${EMBED_HOST}${url.pathname}${url.search}`)
  if (direct && host === EMBED_HOST) return { kind: 'embed', src: direct }

  const converted = embedFromLink(url)
  return converted ? { kind: 'embed', src: converted } : { kind: 'invalid', reason: 'unsupported-link' }
}

/**
 * Secondary path: embed derived from the contact address. With an Embed API key
 * we use Google's official endpoint, otherwise the keyless fallback.
 */
export function buildAddressEmbedSrc(address: string, apiKey?: string | null): string | null {
  const query = address.trim().replace(/\s+/g, ' ')
  if (!query || query.length > MAX_QUERY_LENGTH) return null
  if (apiKey) {
    const url = new URL(`https://${EMBED_HOST}/maps/embed/v1/place`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('q', query)
    return url.toString()
  }
  return buildKeylessEmbed(query)
}

/** "Get directions" link; never embedded, opens Google Maps itself. */
export function buildDirectionsUrl(address: string): string | null {
  const query = address.trim().replace(/\s+/g, ' ')
  if (!query) return null
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', query.slice(0, MAX_QUERY_LENGTH))
  return url.toString()
}
