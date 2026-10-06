import { MockDomainProvider } from './mock-provider'
import { SupabaseDomainProvider } from './supabase-provider'
import type { DomainProvider } from './types'

/**
 * Single place the active domain provider is chosen.
 *
 * Default is the persistent Supabase registry. The in-memory mock is kept for
 * tests and is only used when `DOMAIN_PROVIDER=mock` is set explicitly.
 * Future real integrations (Vercel, Cloudflare) are added here.
 */

let instance: DomainProvider | null = null

export function getDomainProvider(): DomainProvider {
  if (!instance) {
    instance =
      process.env.DOMAIN_PROVIDER === 'mock' ? new MockDomainProvider() : new SupabaseDomainProvider()
  }
  return instance
}
