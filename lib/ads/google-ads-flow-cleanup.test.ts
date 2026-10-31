import { describe, expect, it, vi } from 'vitest'
import {
  revokeAndDeletePendingGoogleAdsFlows,
  scrubAndDeleteExpiredGoogleAdsFlows,
  type PendingGoogleAdsOAuthFlow,
} from '@/lib/ads/google-ads-flow-cleanup'

const flow: PendingGoogleAdsOAuthFlow = {
  id: 'flow-1',
  userId: 'user-1',
  encryptedRefreshToken: 'encrypted-token',
}

describe('pending Google Ads OAuth token cleanup', () => {
  it('does not delete a pending flow when provider revocation fails', async () => {
    const deleteFlow = vi.fn(async () => undefined)
    const revoke = vi.fn(async () => {
      throw new Error('provider unavailable')
    })

    await expect(revokeAndDeletePendingGoogleAdsFlows([flow], {
      decrypt: () => 'refresh-token',
      revoke,
      deleteFlow,
    })).rejects.toThrow()

    expect(revoke).toHaveBeenCalledWith('refresh-token')
    expect(deleteFlow).not.toHaveBeenCalled()
  })

  it('revokes before deleting pending flows', async () => {
    const order: string[] = []

    await revokeAndDeletePendingGoogleAdsFlows([flow], {
      decrypt: () => 'refresh-token',
      revoke: async () => { order.push('revoke') },
      deleteFlow: async () => { order.push('delete') },
    })

    expect(order).toEqual(['revoke', 'delete'])
  })

  it('scrubs and deletes expired flow tokens even when Google revocation fails', async () => {
    const scrub = vi.fn(async () => undefined)
    const deleteFlow = vi.fn(async () => undefined)
    const result = await scrubAndDeleteExpiredGoogleAdsFlows([flow], {
      decrypt: () => 'refresh-token',
      revoke: async () => { throw new Error('provider unavailable') },
      scrub,
      deleteFlow,
    })

    expect(result).toEqual({ revoked: 0, scrubbed: 1, deleted: 1 })
    expect(scrub).toHaveBeenCalledWith(flow)
    expect(deleteFlow).toHaveBeenCalledWith(flow)
  })

  it('still scrubs an expired token after successful revocation', async () => {
    const scrub = vi.fn(async () => undefined)
    const result = await scrubAndDeleteExpiredGoogleAdsFlows([flow], {
      decrypt: () => 'refresh-token',
      revoke: async () => undefined,
      scrub,
      deleteFlow: async () => undefined,
    })

    expect(result.revoked).toBe(1)
    expect(result.scrubbed).toBe(0)
    expect(scrub).toHaveBeenCalledOnce()
  })
})
