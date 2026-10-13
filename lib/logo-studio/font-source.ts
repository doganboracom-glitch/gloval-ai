import { parseTtf, textToPath, type TtfFont } from '@/lib/logo-studio/ttf'
import type { TextAssets } from '@/lib/logo-studio/compose'
import { DEFAULT_FONT_BASE64 } from '@/lib/logo-studio/default-font'

/**
 * Server-side font acquisition for logo wordmarks.
 * Tries the site's own heading font from Google Fonts (TrueType, parsed in
 * process), and falls back to the bundled Poppins subset when the family is
 * unknown, the download fails, or the font lacks a glyph the brand name needs.
 */

const FETCH_TIMEOUT_MS = 4000
const MAX_FONT_BYTES = 2_000_000
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

let bundled: TtfFont | null = null
const cache = new Map<string, { at: number; font: Promise<TtfFont | null> }>()

export function bundledFont(): TtfFont {
  if (!bundled) bundled = parseTtf(new Uint8Array(Buffer.from(DEFAULT_FONT_BASE64, 'base64')))
  return bundled
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function downloadGoogleFont(family: string): Promise<TtfFont | null> {
  if (!/^[A-Za-z0-9 ]{2,40}$/.test(family)) return null
  const slug = family.trim().replace(/\s+/g, '+')
  for (const weight of ['700', '600', '']) {
    try {
      const css = await fetchWithTimeout(
        `https://fonts.googleapis.com/css2?family=${slug}${weight ? `:wght@${weight}` : ''}`,
        { headers: { 'user-agent': 'node' } },
      )
      if (!css.ok) continue
      const match = (await css.text()).match(
        /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+\.ttf)\)/,
      )
      if (!match) continue
      const file = await fetchWithTimeout(match[1])
      if (!file.ok) continue
      const buf = new Uint8Array(await file.arrayBuffer())
      if (buf.byteLength === 0 || buf.byteLength > MAX_FONT_BYTES) continue
      return parseTtf(buf)
    } catch {
      // try the next weight, then give up to the bundled font
    }
  }
  return null
}

/** The site's heading font when obtainable, otherwise `null`. */
export function loadHeadingFont(family: string): Promise<TtfFont | null> {
  const key = family.trim().toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.font
  const font = downloadGoogleFont(family.trim())
  cache.set(key, { at: Date.now(), font })
  return font
}

export function initialsOf(name: string): string {
  const words = name
    .normalize('NFC')
    .split(/[\s\-_.&/]+/)
    .filter((w) => /\p{L}/u.test(w))
  const letters = words.length >= 2 ? [words[0], words[1]] : [words[0] ?? name]
  const out =
    words.length >= 2
      ? letters.map((w) => Array.from(w)[0]).join('')
      : Array.from(letters[0] ?? '?')
          .slice(0, 2)
          .join('')
  return out.toLocaleUpperCase('tr')
}

function assetsFor(font: TtfFont, name: string) {
  const plain = textToPath(font, name, { size: 100, letterSpacing: 0.01 })
  const caps = textToPath(font, name.toLocaleUpperCase('tr'), { size: 100, letterSpacing: 0.14 })
  const mono = textToPath(font, initialsOf(name), { size: 100, letterSpacing: 0.02 })
  return { plain, caps, mono }
}

/**
 * Builds the vector text pieces for a brand name. When the preferred font is
 * missing a glyph the name needs, the bundled font is used for everything so
 * the wordmark never renders with holes.
 */
export async function buildTextAssets(
  name: string,
  headingFont: string,
): Promise<{ assets: TextAssets; fontName: string }> {
  const heading = await loadHeadingFont(headingFont)
  if (heading) {
    const a = assetsFor(heading, name)
    if (a.plain.missing === 0 && a.caps.missing === 0 && a.plain.d) {
      return { assets: { ...a, fauxBold: heading.isVariable }, fontName: headingFont }
    }
  }
  return { assets: { ...assetsFor(bundledFont(), name), fauxBold: false }, fontName: 'Poppins' }
}
