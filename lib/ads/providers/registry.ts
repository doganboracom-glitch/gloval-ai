import { createComingSoonProvider } from '@/lib/ads/providers/coming-soon-provider'
import { createGoogleAdsProvider } from '@/lib/ads/providers/google-ads-provider'
import { ADS_PLATFORMS, type AdsPlatform, type AdsProvider } from '@/lib/ads/providers/types'

const COMING_SOON_NAMES: Record<Exclude<AdsPlatform, 'google_ads'>, string> = {
  meta: 'Meta (Facebook / Instagram)',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  x: 'X',
}

export function isAdsPlatform(value: unknown): value is AdsPlatform {
  return typeof value === 'string' && (ADS_PLATFORMS as readonly string[]).includes(value)
}

/**
 * Providers by platform. Injectable so tests can swap in the mock; production
 * code calls `getAdsProvider` with the default registry.
 */
export function createAdsProviderRegistry(options: {
  googleClientId: string
  googleClientSecret?: string
  overrides?: Partial<Record<AdsPlatform, AdsProvider>>
}): Record<AdsPlatform, AdsProvider> {
  const base: Record<AdsPlatform, AdsProvider> = {
    google_ads: createGoogleAdsProvider({
      clientId: options.googleClientId,
      clientSecret: options.googleClientSecret,
    }),
    meta: createComingSoonProvider('meta', COMING_SOON_NAMES.meta),
    tiktok: createComingSoonProvider('tiktok', COMING_SOON_NAMES.tiktok),
    linkedin: createComingSoonProvider('linkedin', COMING_SOON_NAMES.linkedin),
    x: createComingSoonProvider('x', COMING_SOON_NAMES.x),
  }
  return { ...base, ...options.overrides }
}

export function listConnectablePlatforms(registry: Record<AdsPlatform, AdsProvider>): AdsPlatform[] {
  return ADS_PLATFORMS.filter((platform) => registry[platform].status === 'available')
}
