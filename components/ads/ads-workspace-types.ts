import type { AdsTabId } from '@/components/ads/ads-tabs'
import type { GoogleAdsConnectionView } from '@/components/ads/google-ads-dashboard'
import type { MetaConnectionView } from '@/lib/ads/meta-ads-shared'

/** Server-provided data every platform workspace can read from. */
export type AdsDashboardData = {
  address: string | null
  initialPlanId: string | null
  connections: GoogleAdsConnectionView[]
  pendingFlowId: string | null
  googleStatus: string | null
  publishEnabled: boolean
  killSwitchEnabled: boolean
  termsAcceptedAt: string | null
  metaConnections: MetaConnectionView[]
  metaPendingFlowId: string | null
  metaStatus: string | null
  metaMissingScopes: string | null
  metaManage: { canManage: boolean; canManageProtective: boolean }
}

export type AdsWorkspaceProps = {
  tab: AdsTabId
  onTabChange: (tab: AdsTabId) => void
  data: AdsDashboardData
}
