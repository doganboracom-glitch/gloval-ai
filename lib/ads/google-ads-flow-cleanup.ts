export type PendingGoogleAdsOAuthFlow = {
  id: string
  userId: string
  encryptedRefreshToken: string
}

export type ExpiredGoogleAdsOAuthFlow = PendingGoogleAdsOAuthFlow

export async function revokeAndDeletePendingGoogleAdsFlows(
  flows: readonly PendingGoogleAdsOAuthFlow[],
  dependencies: {
    decrypt: (flow: PendingGoogleAdsOAuthFlow) => string
    revoke: (refreshToken: string) => Promise<void>
    deleteFlow: (flow: PendingGoogleAdsOAuthFlow) => Promise<void>
  },
): Promise<void> {
  for (const flow of flows) {
    const refreshToken = dependencies.decrypt(flow)
    await dependencies.revoke(refreshToken)
    await dependencies.deleteFlow(flow)
  }
}

export async function scrubAndDeleteExpiredGoogleAdsFlows(
  flows: readonly ExpiredGoogleAdsOAuthFlow[],
  dependencies: {
    decrypt: (flow: ExpiredGoogleAdsOAuthFlow) => string
    revoke: (refreshToken: string) => Promise<void>
    scrub: (flow: ExpiredGoogleAdsOAuthFlow) => Promise<void>
    deleteFlow: (flow: ExpiredGoogleAdsOAuthFlow) => Promise<void>
  },
): Promise<{ revoked: number; scrubbed: number; deleted: number }> {
  let revoked = 0
  let scrubbed = 0
  let deleted = 0

  for (const flow of flows) {
    try {
      const refreshToken = dependencies.decrypt(flow)
      await dependencies.revoke(refreshToken)
      revoked += 1
    } catch {
      scrubbed += 1
    }

    await dependencies.scrub(flow)
    await dependencies.deleteFlow(flow)
    deleted += 1
  }

  return { revoked, scrubbed, deleted }
}
