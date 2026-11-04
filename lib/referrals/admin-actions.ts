'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { isReferralFeatureEnabled } from '@/lib/referrals/core'
import { getReferralPartnerEventHistory } from '@/lib/referrals/partner-data'
import type { ReferralPartnerStatusAction, ReferralPartnerStatusEvent } from '@/lib/referrals/partner-types'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const STATUS_ACTIONS: readonly ReferralPartnerStatusAction[] = ['suspend', 'reactivate', 'close']

type StatusActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid_partner' | 'transition_conflict' | 'unavailable' }

export async function updateReferralPartnerStatus(
  partnerId: string,
  action: ReferralPartnerStatusAction,
): Promise<StatusActionResult> {
  const admin = await requireAdmin()
  if (!isReferralFeatureEnabled()) return { ok: false, error: 'unavailable' }
  if (!UUID_PATTERN.test(partnerId) || !STATUS_ACTIONS.includes(action)) {
    return { ok: false, error: 'invalid_partner' }
  }

  try {
    const { data, error } = await createAdminClient().rpc('transition_referral_partner_status', {
      p_partner_id: partnerId,
      p_actor_user_id: admin.userId,
      p_action: action,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'unavailable' }
    }

    const result = data as { ok?: unknown; error?: unknown }
    if (result.ok === true) {
      revalidatePath('/admin/referrals')
      revalidatePath('/settings')
      return { ok: true }
    }
    if (result.error === 'invalid_transition' || result.error === 'not_found') {
      return { ok: false, error: 'transition_conflict' }
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function getReferralPartnerHistory(partnerId: string): Promise<ReferralPartnerStatusEvent[] | null> {
  if (!UUID_PATTERN.test(partnerId)) return null
  return getReferralPartnerEventHistory(partnerId)
}
