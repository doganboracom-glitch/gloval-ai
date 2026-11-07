import 'server-only'

import { resolveMetaAdsAppSettings } from '@/lib/ads/env'
import { createMetaApiClient } from '@/lib/ads/meta-api-client'
import { createMetaAdsProvider, type MetaAdsProvider } from '@/lib/ads/providers/meta-ads-provider'

export type MetaProviderResult =
  | { ok: true; provider: MetaAdsProvider; stateSecret: string; apiVersion: string }
  | { ok: false; reason: 'configuration_missing' }

/** Builds the production provider; returns a configuration error instead of throwing when env is incomplete. */
export function createConfiguredMetaProvider(): MetaProviderResult {
  const resolved = resolveMetaAdsAppSettings()
  if (!resolved.ok) return { ok: false, reason: 'configuration_missing' }
  const { appId, appSecret, stateSecret, apiVersion } = resolved.settings
  return {
    ok: true,
    stateSecret,
    apiVersion,
    provider: createMetaAdsProvider({ client: createMetaApiClient(), appId, appSecret, apiVersion }),
  }
}
