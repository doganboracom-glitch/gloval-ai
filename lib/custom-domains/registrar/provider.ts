import { DomainNameApiProvider } from './domainnameapi-provider'
import { MockRegistrarProvider } from './mock-provider'
import { decideRegistrarMode, describeBlockedReason } from './test-mode'
import type { DomainRegistrarProvider } from './types'

/**
 * Single place the active domain REGISTRAR is chosen — mirrors
 * `lib/custom-domains/provider.ts`'s pattern for the DNS/BYO provider.
 *
 * Returns `null` when nothing is configured, rather than silently falling
 * back to the mock: buying a real domain is a real charge, and a caller must
 * explicitly opt into the dev mock via `DOMAIN_REGISTRAR_MOCK=true`.
 */

let instance: DomainRegistrarProvider | null | undefined

export function getDomainRegistrarProvider(): DomainRegistrarProvider | null {
  if (instance !== undefined) return instance

  const username = process.env.DOMAINNAMEAPI_USERNAME?.trim()
  const apiKey = process.env.DOMAINNAMEAPI_API_KEY?.trim()

  if (username && apiKey) {
    const decision = decideRegistrarMode(process.env.DOMAINNAMEAPI_TEST_MODE, {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    })
    if (decision.kind === 'blocked') {
      // Fail closed: no provider means no credential and no paid call can reach the live endpoint.
      console.warn(`[domainnameapi] registrar disabled: ${describeBlockedReason(decision.reason)}`)
      instance = null
    } else {
      instance = new DomainNameApiProvider(username, apiKey, decision.testMode)
    }
  } else if (process.env.DOMAIN_REGISTRAR_MOCK === 'true') {
    instance = new MockRegistrarProvider()
  } else {
    instance = null
  }

  return instance
}

export function isLiveDomainRegistrar(): boolean {
  return getDomainRegistrarProvider()?.live ?? false
}
