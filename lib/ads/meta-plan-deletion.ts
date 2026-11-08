import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import type { MetaGraph } from '@/lib/ads/meta-publish'

export type MetaPlanObjectStatus = {
  status: string
  effectiveStatus: string | null
}

export type MetaPlanDeletionStatuses = Partial<{
  campaign: MetaPlanObjectStatus
  adSet: MetaPlanObjectStatus
  ad: MetaPlanObjectStatus
}>

export type MetaPlanObjectIds = {
  campaignId: string | null
  adSetId: string | null
  adId: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function statusText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null
}

export function metaPlanIsActive(statuses: MetaPlanDeletionStatuses): boolean {
  return Object.values(statuses).some((value) =>
    value?.status === 'ACTIVE' || value?.effectiveStatus === 'ACTIVE',
  )
}

export async function readMetaPlanDeletionStatuses(input: {
  graph: MetaGraph
  accessToken: string
  context: MetaApiContext
  ids: MetaPlanObjectIds
}): Promise<MetaPlanDeletionStatuses> {
  const objects = [
    { key: 'campaign' as const, id: input.ids.campaignId, endpoint: 'campaign.status' as const, fields: 'id,status,effective_status' },
    { key: 'adSet' as const, id: input.ids.adSetId, endpoint: 'adset.status' as const, fields: 'id,status,effective_status' },
    { key: 'ad' as const, id: input.ids.adId, endpoint: 'ad.status' as const, fields: 'id,status,effective_status' },
  ].filter((object) => object.id)

  const entries = await Promise.all(objects.map(async (object) => {
    const response = await input.graph.request({
      endpoint: object.endpoint,
      path: `/${object.id}`,
      accessToken: input.accessToken,
      query: { fields: object.fields },
      context: input.context,
    })
    const data = record(response)
    const status = statusText(data.status)
    if (!status) throw new Error('Meta object status could not be confirmed')
    return [object.key, { status, effectiveStatus: statusText(data.effective_status) }] as const
  }))

  return Object.fromEntries(entries) as MetaPlanDeletionStatuses
}
