import { PLATFORM_DOMAIN, TENANT_ROOT_DOMAIN } from '@/lib/domains'

/**
 * Domain input normalization + validation.
 *
 * Pure and client-safe so the add-domain form can show the normalized result as
 * the user types, while the server action re-runs the exact same function before
 * persisting anything. Validation therefore cannot be bypassed by posting
 * directly to the action.
 */

export type NormalizeFailure =
  | 'empty'
  | 'has_path'
  | 'has_space'
  | 'non_ascii'
  | 'invalid_format'
  | 'reserved'

export type NormalizeResult =
  | { ok: true; domain: string; changed: boolean }
  | { ok: false; error: NormalizeFailure }

/** Labels must be alphanumeric with inner hyphens; TLD must be 2+ letters. */
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * Hosts the customer may never claim as their own custom domain. Without this,
 * a user could add `gloval.ai` (or a tenant subdomain) and have the platform
 * treat their account as the owner of platform traffic.
 */
function isReserved(domain: string): boolean {
  const platform = PLATFORM_DOMAIN.toLowerCase()
  const tenantRoot = TENANT_ROOT_DOMAIN.toLowerCase()
  return (
    domain === platform ||
    domain.endsWith(`.${platform}`) ||
    domain === tenantRoot ||
    domain.endsWith(`.${tenantRoot}`)
  )
}

/**
 * Turn user input into a registrable domain.
 *
 * Accepted and normalized: `https://www.firma.com/` -> `firma.com`
 * Rejected: real paths, whitespace, non-ASCII (IDN), malformed hosts, and any
 * GLOVAL-owned host.
 */
export function normalizeDomain(raw: string): NormalizeResult {
  const original = (raw ?? '').trim()
  if (!original) return { ok: false, error: 'empty' }

  let value = original.toLowerCase()

  // Interior whitespace is never a typo we should silently fix.
  if (/\s/.test(value)) return { ok: false, error: 'has_space' }

  // Strip a leading scheme. `//host` is also tolerated.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '')

  // Drop credentials and port.
  value = value.replace(/^[^/@]*@/, '')

  // Split off path/query/fragment. A bare trailing slash is fine; anything
  // with real path content is a mistake worth reporting instead of guessing.
  const pathIndex = value.search(/[/?#]/)
  if (pathIndex !== -1) {
    const remainder = value.slice(pathIndex).replace(/^\/+/, '')
    if (remainder.replace(/[?#].*$/, '').length > 0) {
      return { ok: false, error: 'has_path' }
    }
    value = value.slice(0, pathIndex)
  }

  value = value.replace(/:\d+$/, '')

  // Trailing root dot is legal DNS but not what we store.
  value = value.replace(/\.+$/, '')

  // `www` is a convenience prefix, not part of the registrable domain. Only
  // stripped when something meaningful remains (never turn `www.com` into `com`).
  if (value.startsWith('www.')) {
    const withoutWww = value.slice(4)
    if (withoutWww.includes('.')) value = withoutWww
  }

  if (!value) return { ok: false, error: 'empty' }

  // IDN / Turkish-character domains need punycode conversion and registrar
  // support we do not have yet. Reject explicitly instead of mangling them.
  if (/[^\x20-\x7e]/.test(value)) return { ok: false, error: 'non_ascii' }

  if (!DOMAIN_RE.test(value)) return { ok: false, error: 'invalid_format' }
  if (isReserved(value)) return { ok: false, error: 'reserved' }

  return { ok: true, domain: value, changed: value !== original }
}
