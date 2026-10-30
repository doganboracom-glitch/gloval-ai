export const MAX_SITE_ADDRESS_LENGTH = 253

export type SiteAddressResult =
  | { ok: true; host: string; url: string }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid' }

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.test', '.invalid']
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Turns whatever a visitor typed ("Ornek.com", "https://www.ornek.com/hakkimizda?x=1")
 * into a bare public https origin. Only the host survives: path, query, hash,
 * credentials and ports are dropped, so a later scan can never be pointed at an
 * internal service or a specific private URL.
 *
 * This is a syntax gate only. The scanner still has to resolve DNS and refuse
 * non-public addresses itself (the WHOIS ip-guard), because a public-looking
 * name can resolve to a private IP.
 */
export function normalizeSiteAddress(input: string): SiteAddressResult {
  const raw = input.trim()
  if (!raw) return { ok: false, reason: 'empty' }
  if (raw.length > MAX_SITE_ADDRESS_LENGTH) return { ok: false, reason: 'too_long' }
  if (/\s/.test(raw)) return { ok: false, reason: 'invalid' }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? raw : `https://${raw}`)
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, reason: 'invalid' }
  if (parsed.username || parsed.password) return { ok: false, reason: 'invalid' }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') return { ok: false, reason: 'invalid' }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.includes(':') || host.startsWith('[')) return { ok: false, reason: 'invalid' }
  if (!host.includes('.')) return { ok: false, reason: 'invalid' }
  if (/^[\d.]+$/.test(host)) return { ok: false, reason: 'invalid' }
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: 'invalid' }
  }

  const labels = host.split('.')
  const tld = labels[labels.length - 1]
  if (!labels.every((label) => LABEL.test(label))) return { ok: false, reason: 'invalid' }
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return { ok: false, reason: 'invalid' }

  return { ok: true, host, url: `https://${host}` }
}
