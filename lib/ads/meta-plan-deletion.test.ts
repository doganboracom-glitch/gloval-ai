import { describe, expect, it, vi } from 'vitest'
import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import type { MetaGraph } from '@/lib/ads/meta-publish'
import { metaPlanIsActive, readMetaPlanDeletionStatuses } from '@/lib/ads/meta-plan-deletion'

const baseInput = {
  accessToken: 'token-not-used-by-test',
  context: {} as MetaApiContext,
  ids: { campaignId: 'campaign-1', adSetId: 'adset-1', adId: 'ad-1' },
}

describe('Meta plan deletion verification', () => {
  it('confirms configured and effective paused states for every existing object', async () => {
    const byId: Record<string, Record<string, string>> = {
      'campaign-1': { id: 'campaign-1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED' },
      'adset-1': { id: 'adset-1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED' },
      'ad-1': { id: 'ad-1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED' },
    }
    const request = vi.fn(async ({ path }: { path: string }) => byId[path.slice(1)])
    const snapshot = await readMetaPlanDeletionStatuses({
      ...baseInput,
      graph: { request } as unknown as MetaGraph,
    })

    expect(metaPlanIsActive(snapshot)).toBe(false)
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('refuses an active configured or effective state', async () => {
    const byId: Record<string, Record<string, string>> = {
      'campaign-1': { id: 'campaign-1', status: 'PAUSED', effective_status: 'ACTIVE' },
      'adset-1': { id: 'adset-1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED' },
      'ad-1': { id: 'ad-1', status: 'PAUSED', effective_status: 'CAMPAIGN_PAUSED' },
    }
    const snapshot = await readMetaPlanDeletionStatuses({
      ...baseInput,
      graph: { request: async ({ path }: { path: string }) => byId[path.slice(1)] } as unknown as MetaGraph,
    })

    expect(metaPlanIsActive(snapshot)).toBe(true)
  })

  it('does not infer archived/deleted when Meta no longer returns the object status', async () => {
    await expect(readMetaPlanDeletionStatuses({
      ...baseInput,
      graph: { request: async () => ({ id: 'missing-status' }) } as unknown as MetaGraph,
    })).rejects.toThrow('status')
  })
})
