import { AdsProviderError, type AdsProvider } from '@/lib/ads/providers/types'

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords'
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export type GoogleAdsProviderConfig = {
  clientId: string
}

function notImplemented(operation: string): never {
  throw new AdsProviderError('not_implemented', `Google Ads ${operation} is not implemented in this release`)
}

/**
 * Skeleton for the Google Ads provider. Only the pure authorization URL is
 * real; every network operation throws `not_implemented` until the connection
 * PR lands, so nothing can reach Google or spend money through this class yet.
 */
export function createGoogleAdsProvider(config: GoogleAdsProviderConfig): AdsProvider {
  return {
    platform: 'google_ads',
    status: 'available',
    displayName: 'Google Ads',

    buildAuthUrl({ state, redirectUri }) {
      if (!config.clientId) throw new AdsProviderError('invalid_input', 'Google client id is missing')
      if (!state) throw new AdsProviderError('invalid_input', 'state is required')
      if (!/^https:\/\//.test(redirectUri) && !/^http:\/\/localhost(:\d+)?\//.test(redirectUri)) {
        throw new AdsProviderError('invalid_input', 'redirect uri must be https (or localhost)')
      }
      const url = new URL(GOOGLE_AUTH_ENDPOINT)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', GOOGLE_ADS_SCOPE)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('include_granted_scopes', 'false')
      url.searchParams.set('state', state)
      return url.toString()
    },

    exchangeCode: async () => notImplemented('code exchange'),
    refreshAccessToken: async () => notImplemented('token refresh'),
    listAccounts: async () => notImplemented('account listing'),
    publishCampaign: async () => notImplemented('campaign publishing'),
    setCampaignStatus: async () => notImplemented('campaign status change'),
    revoke: async () => notImplemented('revocation'),
  }
}
