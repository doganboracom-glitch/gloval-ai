import {
  AdsProviderError,
  type AdsCampaignPublishInput,
  type AdsPlatform,
  type AdsProvider,
} from '@/lib/ads/providers/types'

export type MockProviderCalls = {
  published: AdsCampaignPublishInput[]
  statusChanges: Array<{ externalCampaignId: string; status: 'paused' | 'enabled' }>
  revoked: string[]
}

/**
 * In-memory provider for tests. Publishing is idempotent per `requestId`, like
 * a real provider must be, and never touches the network.
 */
export function createMockAdsProvider(
  platform: AdsPlatform = 'google_ads',
  options: { failPublishWith?: AdsProviderError } = {},
): { provider: AdsProvider; calls: MockProviderCalls } {
  const calls: MockProviderCalls = { published: [], statusChanges: [], revoked: [] }
  const byRequestId = new Map<string, string>()

  const provider: AdsProvider = {
    platform,
    status: 'available',
    displayName: `Mock ${platform}`,
    buildAuthUrl: ({ state, redirectUri }) =>
      `https://mock.invalid/oauth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    exchangeCode: async ({ code }) => ({
      accessToken: `access-${code}`,
      refreshToken: `refresh-${code}`,
      expiresAt: null,
      scopes: ['mock'],
    }),
    refreshAccessToken: async () => ({ accessToken: 'access-refreshed', expiresAt: null }),
    listAccounts: async () => [
      { externalAccountId: '1234567890', name: 'Mock account', currency: 'TRY', isManager: false, loginCustomerId: null },
    ],
    publishCampaign: async (input) => {
      if (options.failPublishWith) throw options.failPublishWith
      calls.published.push(input)
      const existing = byRequestId.get(input.requestId)
      if (existing) return { externalCampaignId: existing, status: 'paused' }
      const id = `mock-campaign-${byRequestId.size + 1}`
      byRequestId.set(input.requestId, id)
      return { externalCampaignId: id, status: 'paused' }
    },
    setCampaignStatus: async ({ externalCampaignId, status }) => {
      calls.statusChanges.push({ externalCampaignId, status })
    },
    revoke: async (refreshToken) => {
      calls.revoked.push(refreshToken)
    },
  }
  return { provider, calls }
}
