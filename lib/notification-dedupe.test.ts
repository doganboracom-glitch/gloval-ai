import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claimNotification } from './notify'

vi.mock('server-only', () => ({}))

const claimedKeys = new Set<string>()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: { dedupe_key: string }) => {
        if (claimedKeys.has(row.dedupe_key)) return { error: { code: '23505', message: 'unique violation' } }
        claimedKeys.add(row.dedupe_key)
        return { error: null }
      },
    }),
  }),
}))


describe('notification dedupe persistence contract', () => {
  beforeEach(() => claimedKeys.clear())

  it('claims an order event once across sequential calls', async () => {
    const input = {
      userId: 'owner-1',
      type: 'store_order_delivered',
      subject: 'Store order email',
      body: null,
      dedupeKey: 'store-order:order-1:delivered',
    }

    expect(await claimNotification(input)).toBe(true)
    expect(await claimNotification(input)).toBe(false)
    expect(claimedKeys).toEqual(new Set(['store-order:order-1:delivered']))
  })

  it('keeps shipped and delivered events separate but stable', async () => {
    const shipped = {
      userId: 'owner-1', type: 'store_order_shipped', subject: 'Store order email', body: null,
      dedupeKey: 'store-order:order-1:shipped',
    }
    const delivered = { ...shipped, type: 'store_order_delivered', dedupeKey: 'store-order:order-1:delivered' }

    expect(await claimNotification(shipped)).toBe(true)
    expect(await claimNotification(shipped)).toBe(false)
    expect(await claimNotification(delivered)).toBe(true)
    expect(await claimNotification(delivered)).toBe(false)
  })
})
