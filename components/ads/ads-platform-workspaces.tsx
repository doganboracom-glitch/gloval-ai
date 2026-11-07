import type { ComponentType } from 'react'
import type { AdsPlatformCatalogId } from '@/lib/ads/platforms'
import type { AdsWorkspaceProps } from '@/components/ads/ads-workspace-types'
import { GoogleAdsPlatformWorkspace } from '@/components/ads/google-ads-platform-workspace'

/**
 * Tab content per platform. A platform without an entry here has no dashboard
 * yet; selecting it shows the coming-soon panel instead of the tab list.
 * Add a new platform by registering its workspace component here.
 */
export const ADS_PLATFORM_WORKSPACES: Partial<Record<AdsPlatformCatalogId, ComponentType<AdsWorkspaceProps>>> = {
  google_ads: GoogleAdsPlatformWorkspace,
}
