import { AdsProviderError, type AdsPlatform, type AdsProvider } from '@/lib/ads/providers/types'

function comingSoon(displayName: string): never {
  throw new AdsProviderError('coming_soon', `${displayName} is not available yet`)
}

/** A listed-but-not-connectable platform. Every operation fails closed with `coming_soon`. */
export function createComingSoonProvider(platform: AdsPlatform, displayName: string): AdsProvider {
  return {
    platform,
    status: 'coming_soon',
    displayName,
    buildAuthUrl: () => comingSoon(displayName),
    exchangeCode: async () => comingSoon(displayName),
    refreshAccessToken: async () => comingSoon(displayName),
    listAccounts: async () => comingSoon(displayName),
    publishCampaign: async () => comingSoon(displayName),
    setCampaignStatus: async () => comingSoon(displayName),
    revoke: async () => comingSoon(displayName),
  }
}
