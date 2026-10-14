'use server'

import { createClient } from '@/lib/supabase/server'
import { buildAddressEmbedSrc, parseMapInput } from '@/lib/map-embed'
import { resolveShortMapLink } from '@/lib/map-short-link'

export type MapInputResult =
  | { ok: true; src: string }
  | { ok: false; error: 'invalid' | 'unsafe' | 'wrong-domain' | 'unsupported-link' | 'short-link' | 'unauthorized' }

/**
 * Validates what the owner pasted into the map field and returns the clean embed
 * `src` to store (empty string = remove the map). Short links are resolved here
 * because the browser cannot read cross-origin redirects.
 */
export async function resolveMapInputAction(raw: string): Promise<MapInputResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'unauthorized' }

  const parsed = parseMapInput(typeof raw === 'string' ? raw : '')
  switch (parsed.kind) {
    case 'empty':
      return { ok: true, src: '' }
    case 'embed':
      return { ok: true, src: parsed.src }
    case 'short-link': {
      const resolved = await resolveShortMapLink(parsed.url)
      return resolved.ok ? { ok: true, src: resolved.src } : { ok: false, error: 'short-link' }
    }
    case 'invalid':
      if (parsed.reason === 'unsafe') return { ok: false, error: 'unsafe' }
      if (parsed.reason === 'not-google') return { ok: false, error: 'wrong-domain' }
      if (parsed.reason === 'unsupported-link') return { ok: false, error: 'unsupported-link' }
      return { ok: false, error: 'invalid' }
  }
}

/**
 * Secondary path: embed URL built from the contact address. Called only after
 * the visitor agrees to load the map, so the (public, referrer-restricted)
 * Embed API key never ships in the client bundle.
 */
export async function getAddressMapSrcAction(address: string): Promise<string | null> {
  if (typeof address !== 'string') return null
  return buildAddressEmbedSrc(address, process.env.GOOGLE_MAPS_EMBED_API_KEY)
}
