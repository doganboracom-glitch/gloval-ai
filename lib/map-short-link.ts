import { isGoogleMapsLinkHost, isMapsShortLinkHost, parseMapInput } from '@/lib/map-embed'

/**
 * Resolves a `maps.app.goo.gl` short link to an embeddable URL.
 *
 * Server-side fetching of an owner-supplied URL is an SSRF risk, so this only
 * ever contacts the short-link host, follows redirects manually, and refuses to
 * leave Google's own hosts at any hop. Failure is an expected outcome (Google may
 * answer with a consent page or block the request); callers then show the
 * "use Share -> Embed a map" guidance instead.
 */

const MAX_HOPS = 4
const TIMEOUT_MS = 4000

type FetchLike = (
  input: string,
  init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; headers: { get(name: string): string | null } }>

export type ShortLinkResult = { ok: true; src: string } | { ok: false }

export async function resolveShortMapLink(
  shortUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<ShortLinkResult> {
  let current: URL
  try {
    current = new URL(shortUrl)
  } catch {
    return { ok: false }
  }
  if (current.protocol !== 'https:' || !isMapsShortLinkHost(current.hostname)) return { ok: false }

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let response
    try {
      response = await fetchImpl(current.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; GlovalMapResolver/1.0)' },
      })
    } catch {
      return { ok: false }
    }

    if (response.status < 300 || response.status >= 400) return { ok: false }
    const location = response.headers.get('location')
    if (!location) return { ok: false }

    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return { ok: false }
    }

    // EU traffic is sometimes bounced through a consent page that carries the
    // real destination in `continue`.
    if (next.hostname === 'consent.google.com') {
      const target = next.searchParams.get('continue')
      if (!target) return { ok: false }
      try {
        next = new URL(target)
      } catch {
        return { ok: false }
      }
    }

    if (next.protocol !== 'https:') return { ok: false }
    const host = next.hostname.toLowerCase()

    if (isGoogleMapsLinkHost(host)) {
      const parsed = parseMapInput(next.toString())
      return parsed.kind === 'embed' ? { ok: true, src: parsed.src } : { ok: false }
    }
    if (!isMapsShortLinkHost(host)) return { ok: false }
    current = next
  }
  return { ok: false }
}
