import 'server-only'

import { withMetaAccess } from '@/lib/ads/meta-connections'
import type {
  MetaAdsRange,
  MetaCampaignReport,
  MetaInsightRow,
  MetaPerformanceReport,
} from '@/lib/ads/meta-ads-shared'
import { createMetaReportCache } from '@/lib/ads/meta-report-cache'
import type { MetaAdsProvider } from '@/lib/ads/providers/meta-ads-provider'

const reportCache = createMetaReportCache<MetaPerformanceReport>()

const EMPTY_ROW: MetaInsightRow = { impressions: 0, clicks: 0, spend: 0, reach: 0, ctr: null, cpc: null }

export function mergeMetaCampaignReports(
  campaigns: Awaited<ReturnType<MetaAdsProvider['getCampaigns']>>,
  rows: Awaited<ReturnType<MetaAdsProvider['getInsights']>>,
): MetaCampaignReport[] {
  const byCampaign = new Map(rows.filter((row) => row.campaignId).map((row) => [row.campaignId as string, row]))
  const merged: MetaCampaignReport[] = campaigns.map((campaign) => {
    const row = byCampaign.get(campaign.id)
    return { ...campaign, ...(row ? stripCampaignId(row) : EMPTY_ROW) }
  })
  return merged.sort((a, b) => b.spend - a.spend)
}

function stripCampaignId(row: MetaInsightRow & { campaignId: string | null }): MetaInsightRow {
  const { campaignId: _campaignId, ...rest } = row
  return rest
}

export async function getMetaPerformanceReport(input: {
  userId: string
  connectionId: string
  range: MetaAdsRange
  provider: MetaAdsProvider
}): Promise<{ report: MetaPerformanceReport; cached: boolean }> {
  const key = `${input.userId}:${input.connectionId}:${input.range}`
  const result = await reportCache.get(key, () =>
    withMetaAccess({
      userId: input.userId,
      connectionId: input.connectionId,
      action: async ({ connection, accessToken, context }) => {
        const accountId = connection.external_account_id
        // Sequential on purpose: each call reserves quota, and a 190/rate-limit failure should stop the rest.
        const accountStatus = await input.provider.getAccountStatus({ accessToken, accountId, context })
        const accountRows = await input.provider.getInsights({ accessToken, accountId, range: input.range, level: 'account', context })
        const campaigns = await input.provider.getCampaigns({ accessToken, accountId, context })
        const campaignRows = await input.provider.getInsights({ accessToken, accountId, range: input.range, level: 'campaign', context })
        const totals = accountRows[0] ? stripCampaignId(accountRows[0]) : EMPTY_ROW
        return {
          range: input.range,
          currency: connection.currency_code,
          accountStatus: accountStatus ?? connection.account_status,
          totals,
          campaigns: mergeMetaCampaignReports(campaigns, campaignRows),
        } satisfies MetaPerformanceReport
      },
    }),
  )
  return { report: result.value, cached: result.cached }
}

export function invalidateMetaReportCache(userId: string, connectionId?: string) {
  reportCache.invalidate(connectionId ? `${userId}:${connectionId}:` : `${userId}:`)
}
