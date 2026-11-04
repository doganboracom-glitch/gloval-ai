'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { isReferralFeatureEnabled } from '@/lib/referrals/core'
import { mapReferralAdminRpcResult } from '@/lib/referrals/partner-data'
import type { ReferralAdminPartner, ReferralPartnerStatusAction, ReferralPartnerStatusEvent } from '@/lib/referrals/partner-types'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const STATUS_ACTIONS: readonly ReferralPartnerStatusAction[] = ['suspend', 'reactivate', 'close']

type StatusActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid_partner' | 'transition_conflict' | 'unavailable' }

export async function searchReferralPartners(query: string): Promise<ReferralAdminPartner[] | null> {
  await requireAdmin()
  if (!isReferralFeatureEnabled()) return null
  const normalizedQuery = typeof query === 'string' ? query.trim().slice(0, 254) : ''

  try {
    const { data, error } = await createAdminClient().rpc('referral_partner_admin_summary', {
      p_query: normalizedQuery || null,
    })
    if (error) return null
    return mapReferralAdminRpcResult(data)
  } catch {
    return null
  }
}

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
  await requireAdmin()
  if (!isReferralFeatureEnabled() || !UUID_PATTERN.test(partnerId)) return null

  try {
    const { data, error } = await createAdminClient()
      .from('referral_partner_events')
      .select('id,actor_user_id,action,from_status,to_status,created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !Array.isArray(data)) return null

    return data.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return []
      const row = value as Record<string, unknown>
      const id = typeof row.id === 'string' && UUID_PATTERN.test(row.id) ? row.id : null
      const action = row.action === 'suspend' || row.action === 'reactivate' || row.action === 'close'
        ? row.action
        : null
      const fromStatus = row.from_status === 'active' || row.from_status === 'suspended' || row.from_status === 'closed'
        ? row.from_status
        : null
      const toStatus = row.to_status === 'active' || row.to_status === 'suspended' || row.to_status === 'closed'
        ? row.to_status
        : null
      const createdAt = typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
        ? row.created_at
        : null

      if (!id || !action || !fromStatus || !toStatus || !createdAt) return []
      return [{
        id,
        actorUserId: typeof row.actor_user_id === 'string' && UUID_PATTERN.test(row.actor_user_id)
          ? row.actor_user_id
          : null,
        action,
        fromStatus,
        toStatus,
        createdAt,
      }]
    })
  } catch {
    return null
  }
}
