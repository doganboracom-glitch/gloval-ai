import { describe, expect, it, vi } from 'vitest'
import type { MetaApiContext } from '@/lib/ads/meta-api-client'
import type { MetaGraph } from '@/lib/ads/meta-publish'
import { getMetaMinimumDailyBudget, metaMinimumBudgetField, parseMetaMinimumDailyBudget } from '@/lib/ads/meta-budget'

const context = {} as MetaApiContext

function input(graph: MetaGraph, connectionId: string, optimizationGoal: 'LANDING_PAGE_VIEWS' | 'LINK_CLICKS') {
  return {
    graph,
    accessToken: 'token-not-used-by-test',
    context,
    accountId: 'act_123',
    connectionId,
    currency: 'TRY',
    optimizationGoal,
  }
}

describe('Meta minimum budgets', () => {
  it('uses the documented high-frequency field for link clicks and lets validate_only decide LPV floors', () => {
    expect(metaMinimumBudgetField('LINK_CLICKS')).toBe('min_daily_budget_high_freq')
    expect(metaMinimumBudgetField('LANDING_PAGE_VIEWS')).toBeNull()
  })

  it('reads the account-currency floor and caches it by account, currency, and optimization goal', async () => {
    const request = vi.fn().mockResolvedValue({
      data: [{ currency: 'TRY', min_daily_budget_high_freq: '12500' }],
    })
    const graph = { request } as unknown as MetaGraph
    const options = input(graph, 'connection-clicks-unique', 'LINK_CLICKS')

    await expect(getMetaMinimumDailyBudget({ ...options, now: 1_000 })).resolves.toBe(12_500)
    await expect(getMetaMinimumDailyBudget({ ...options, now: 2_000 })).resolves.toBe(12_500)

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'act.minimum_budgets',
      path: '/act_123/minimum_budgets',
      query: { fields: 'currency,min_daily_budget_high_freq' },
    }))
  })

  it('does not invent an LPV budget floor when Meta has no directly mapped field', async () => {
    const request = vi.fn()
    const graph = { request } as unknown as MetaGraph

    await expect(getMetaMinimumDailyBudget(input(graph, 'connection-lpv-unique', 'LANDING_PAGE_VIEWS'))).resolves.toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects a floor in a different currency instead of applying it to the account', () => {
    expect(parseMetaMinimumDailyBudget(
      { data: [{ currency: 'USD', min_daily_budget_high_freq: '9900' }] },
      'LINK_CLICKS',
      'TRY',
    )).toBeNull()
  })
})
