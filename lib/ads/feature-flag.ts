import { resolveAdsFeatureUi } from '@/lib/domains/flag-resolvers.mjs'

export const ADS_PATH = '/ads'
export const ADS_DASHBOARD_PATH = '/ads/dashboard'

/**
 * Whether GLOVAL Ads (BETA) exists at all: the /ads pages, the header and
 * footer links and the sitemap entry.
 *
 * Source of truth is the ADS_FEATURE_UI environment variable, resolved once at
 * build time by next.config.mjs into NEXT_PUBLIC_ADS_FEATURE_UI so server and
 * client code (the header and footer are client components) always agree.
 * Changing the variable needs a new deployment. Default is OFF in every
 * environment.
 */
export function isAdsFeatureUiEnabled(
  raw: string | undefined = process.env.NEXT_PUBLIC_ADS_FEATURE_UI,
): boolean {
  return raw === '1'
}

export { resolveAdsFeatureUi }
