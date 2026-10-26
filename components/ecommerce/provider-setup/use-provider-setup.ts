'use client'

import useSWR from 'swr'
import type { ProviderSetupConfig, ProviderSetupOverview } from '@/lib/payment-providers/types'

/**
 * One SWR entry per provider and store, shared by the editor's status summary
 * and the settings window, so a key saved or a test passed in the window
 * updates the summary without a second round trip.
 */
export function useProviderSetup(config: ProviderSetupConfig, projectId: string, recheckKey = 0) {
  return useSWR<ProviderSetupOverview>(
    ['provider-setup', config.id, projectId, recheckKey],
    () => config.loadOverview(projectId),
    { revalidateOnFocus: false, keepPreviousData: true },
  )
}
