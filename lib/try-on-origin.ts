import { getTenantSlugFromHost, isForeignHost } from '@/lib/domains'

/**
 * Same-origin guard for the public `/api/try-on` endpoint.
 *
 * The endpoint is reachable from tenant hosts (`<slug>.gloval.site` and bound
 * custom domains) as well as the platform host. A browser always attaches
 * `Origin` to a same-origin POST, so requiring Origin == Host and then asking
 * "may THIS host speak for THIS store?" stops another website from driving a
 * visitor's browser into spending a store owner's credits. It is defence in
 * depth for browsers only — a non-browser client can forge headers, which is
 * why the durable per-IP limiter and the owner's credit balance still apply.
 */

export type TryOnOriginDeps = {
  /** Slug of the published site bound to this custom-domain host, or null. */
  resolveCustomDomainSlug: (host: string) => Promise<string | null>
}

export type TryOnOriginInput = {
  origin: string | null
  referer: string | null
  host: string | null
  mode: 'store' | 'demo'
  storeSlug: string
}

function hostOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

export async function isAllowedTryOnOrigin(
  input: TryOnOriginInput,
  deps: TryOnOriginDeps,
): Promise<boolean> {
  const requestHost = input.host?.toLowerCase().trim() || null
  const callerHost = hostOf(input.origin) ?? hostOf(input.referer)
  if (!requestHost || !callerHost || callerHost !== requestHost) return false

  const tenantSlug = getTenantSlugFromHost(requestHost)
  if (tenantSlug) {
    return input.mode === 'store' && tenantSlug === input.storeSlug
  }

  if (isForeignHost(requestHost)) {
    if (input.mode !== 'store') return false
    const boundSlug = await deps.resolveCustomDomainSlug(requestHost)
    return boundSlug !== null && boundSlug === input.storeSlug
  }

  // Platform host, previews and local dev: `/site/<slug>` and `/demo/*` pages.
  return true
}
