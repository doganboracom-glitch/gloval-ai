import { createAdminClient } from '@/lib/supabase/admin'
import { isReferralFeatureEnabled } from './core'

export type ReferralCommissionSyncResult = {
  ok: boolean
  created: number
  reversed: number
  matured: number
}

function safeCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export async function syncReferralCommissions(
  partnerId: string | null = null,
): Promise<ReferralCommissionSyncResult> {
  if (!isReferralFeatureEnabled()) return { ok: true, created: 0, reversed: 0, matured: 0 }

  try {
    const { data, error } = await createAdminClient().rpc('referral_sync_commissions', {
      p_partner_id: partnerId,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, created: 0, reversed: 0, matured: 0 }
    }

    const result = data as Record<string, unknown>
    return {
      ok: result.ok === true,
      created: safeCount(result.created),
      reversed: safeCount(result.reversed),
      matured: safeCount(result.matured),
    }
  } catch {
    return { ok: false, created: 0, reversed: 0, matured: 0 }
  }
}
