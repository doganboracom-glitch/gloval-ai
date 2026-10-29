import { resolveDomainSearchDemo, resolveWhoisEnabled } from './flag-resolvers.mjs'

export const WHOIS_LOOKUP_PATH = '/whois'

/**
 * Whether the public /whois page, its footer link and its sitemap entry exist.
 *
 * Source of truth is the WHOIS_LOOKUP_ENABLED environment variable, resolved
 * once at build time by next.config.mjs into NEXT_PUBLIC_WHOIS_LOOKUP_ENABLED
 * so server and client code always agree. Changing the variable needs a new
 * deployment. Production default is OFF.
 */
export function isWhoisLookupEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_WHOIS_LOOKUP_ENABLED,
): boolean {
  return raw === '1'
}

/** Server-side only: fake-result demo of the domain search page (never in production). */
export function isDomainSearchDemo(env: Record<string, string | undefined> = process.env): boolean {
  return resolveDomainSearchDemo(env)
}

export { resolveWhoisEnabled }
