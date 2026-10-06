/**
 * Decides which DomainNameAPI endpoint the registrar may talk to.
 *
 * `DOMAINNAMEAPI_TEST_MODE` used to be compared with a strict `=== 'true'`.
 * Hosting dashboards and `.env` files frequently store the value with quotes
 * (`'true'`), different casing (`True`) or stray whitespace, all of which
 * evaluated to `false` and silently sent OTE (test) credentials to the
 * PRODUCTION endpoint (`HTTP 401` / `API_401`).
 *
 * The decision is now fail-closed: the production endpoint is reachable ONLY
 * when the flag is explicitly falsy AND the code runs in a production
 * deployment. A missing, empty or unrecognised flag, or a preview/local run
 * pointed at production, yields `blocked`, so no credential and no paid call
 * ever leaves for the live endpoint by accident.
 */

const TRUTHY = new Set(['true', '1', 'yes', 'on'])
const FALSY = new Set(['false', '0', 'no', 'off'])

export const REGISTRAR_ENDPOINTS = {
  test: 'https://ote.domainresellerapi.com/api/v1',
  production: 'https://api.domainresellerapi.com/api/v1',
} as const

export type BlockedReason = 'mode_unset' | 'mode_unrecognized' | 'live_not_allowed_here'

export type RegistrarModeDecision =
  | { kind: 'test'; testMode: true; endpoint: typeof REGISTRAR_ENDPOINTS.test }
  | { kind: 'live'; testMode: false; endpoint: typeof REGISTRAR_ENDPOINTS.production }
  | { kind: 'blocked'; reason: BlockedReason }

export type RuntimeEnvironment = {
  VERCEL_ENV?: string
  NODE_ENV?: string
}

function normalize(raw: string | undefined): string {
  let value = (raw ?? '').trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim()
  }
  return value.toLowerCase()
}

/** True only for a real production deployment (never preview, never local dev). */
export function isProductionRuntime(env: RuntimeEnvironment): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production'
  return env.NODE_ENV === 'production'
}

export function decideRegistrarMode(raw: string | undefined, env: RuntimeEnvironment): RegistrarModeDecision {
  const value = normalize(raw)
  if (TRUTHY.has(value)) return { kind: 'test', testMode: true, endpoint: REGISTRAR_ENDPOINTS.test }
  if (value === '') return { kind: 'blocked', reason: 'mode_unset' }
  if (!FALSY.has(value)) return { kind: 'blocked', reason: 'mode_unrecognized' }
  if (!isProductionRuntime(env)) return { kind: 'blocked', reason: 'live_not_allowed_here' }
  return { kind: 'live', testMode: false, endpoint: REGISTRAR_ENDPOINTS.production }
}

export function describeBlockedReason(reason: BlockedReason): string {
  switch (reason) {
    case 'mode_unset':
      return 'DOMAINNAMEAPI_TEST_MODE is not set. Set it to "true" (OTE test) or explicitly "false" (live, production deployments only).'
    case 'mode_unrecognized':
      return 'DOMAINNAMEAPI_TEST_MODE has an unrecognised value. Use "true" for the OTE test endpoint or "false" for live.'
    case 'live_not_allowed_here':
      return 'The live DomainNameAPI endpoint is only reachable from a production deployment. Set DOMAINNAMEAPI_TEST_MODE=true for preview/local.'
  }
}
