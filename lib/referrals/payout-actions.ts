'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import { isReferralCashPayoutsEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { queueReferralPayoutNotification } from '@/lib/referrals/email-outbox'
import type { ReferralPayoutMethod } from '@/lib/referrals/partner-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PAYOUT_METHODS: readonly ReferralPayoutMethod[] = ['cash', 'credit']

type PayoutActionError =
  | 'not_authenticated'
  | 'payout_disabled'
  | 'cash_disabled'
  | 'not_found'
  | 'partner_inactive'
  | 'insufficient_balance'
  | 'open_cash_request'
  | 'missing_iban'
  | 'invalid_tax_status'
  | 'idempotency_conflict'
  | 'invalid_input'
  | 'credit_unavailable'
  | 'unavailable'

type PayoutActionResult =
  | {
      ok: true
      requestId: string
      method: ReferralPayoutMethod
      balanceCents: number
      payoutCents: number
      creditAmount: number | null
      systemTopupCents: number
      invoiceRequired: boolean
      taxSuspended: boolean
    }
  | { ok: false; error: PayoutActionError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function mapRpcError(value: unknown, method: ReferralPayoutMethod, hasIban: boolean): PayoutActionError {
  if (value === 'not_owner' || value === 'not_found') return 'not_found'
  if (value === 'partner_closed') return 'partner_inactive'
  if (value === 'minimum_not_met') return 'insufficient_balance'
  if (value === 'open_cash_request') return 'open_cash_request'
  if (value === 'idempotency_conflict') return 'idempotency_conflict'
  if (value === 'invalid_input') return 'invalid_input'
  if (value === 'credit_amount_out_of_range') return 'credit_unavailable'
  if (value === 'payout_details_missing') return method === 'cash' && !hasIban ? 'missing_iban' : 'invalid_tax_status'
  return 'unavailable'
}

export async function createReferralPayoutRequest(input: {
  method: unknown
  idempotencyKey: unknown
  lang?: unknown
}): Promise<PayoutActionResult> {
  if (!isReferralPayoutsEnabled()) return { ok: false, error: 'payout_disabled' }
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' }

  const method = input.method
  if (typeof method !== 'string' || !PAYOUT_METHODS.includes(method as ReferralPayoutMethod)) {
    return { ok: false, error: 'invalid_input' }
  }
  const payoutMethod = method as ReferralPayoutMethod
  if (payoutMethod === 'cash' && !isReferralCashPayoutsEnabled()) {
    return { ok: false, error: 'cash_disabled' }
  }
  if (typeof input.idempotencyKey !== 'string' || !UUID_PATTERN.test(input.idempotencyKey)) {
    return { ok: false, error: 'invalid_input' }
  }

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return { ok: false, error: 'not_authenticated' }

  try {
    const admin = createAdminClient()
    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('id,status,iban_last4')
      .eq('user_id', authState.user.id)
      .maybeSingle()

    if (partnerError) return { ok: false, error: 'unavailable' }
    if (!partner) return { ok: false, error: 'not_found' }
    if (partner.status === 'closed') return { ok: false, error: 'partner_inactive' }

    const { data, error } = await admin.rpc('request_referral_payout', {
      p_partner_id: partner.id,
      p_user_id: authState.user.id,
      p_method: payoutMethod,
      p_idempotency_key: input.idempotencyKey,
    })
    if (error || !isRecord(data)) return { ok: false, error: 'unavailable' }
    if (data.ok !== true) {
      return { ok: false, error: mapRpcError(data.error, payoutMethod, Boolean(partner.iban_last4)) }
    }

    const requestId = typeof data.requestId === 'string' && UUID_PATTERN.test(data.requestId)
      ? data.requestId
      : null
    const balanceCents = nonNegativeInteger(data.balanceCents)
    const payoutCents = nonNegativeInteger(data.payoutCents)
    const systemTopupCents = nonNegativeInteger(data.systemTopupCents) ?? 0
    const creditAmount = data.creditAmount == null ? null : nonNegativeInteger(data.creditAmount)
    if (
      !requestId ||
      balanceCents === null ||
      payoutCents === null ||
      (data.creditAmount != null && creditAmount === null)
    ) return { ok: false, error: 'unavailable' }

    const lang = input.lang === 'en' ? 'en' : 'tr'
    const noticeBase = { partnerId: partner.id, payoutRequestId: requestId, lang }
    if (payoutMethod === 'cash') {
      await queueReferralPayoutNotification({
        ...noticeBase,
        type: 'referral_cash_requested',
        amountCents: payoutCents,
      })
      await queueReferralPayoutNotification({
        ...noticeBase,
        type: 'referral_cash_admin',
        amountCents: payoutCents,
      })
    } else {
      await queueReferralPayoutNotification({
        ...noticeBase,
        type: 'referral_credit_converted',
        creditAmount,
        systemTopupCents,
      })
    }

    revalidatePath('/settings')
    revalidatePath('/dashboard')
    revalidatePath('/admin/referrals')

    return {
      ok: true,
      requestId,
      method: payoutMethod,
      balanceCents,
      payoutCents,
      creditAmount,
      systemTopupCents,
      invoiceRequired: data.invoiceRequired === true,
      taxSuspended: data.taxSuspended === true,
    }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
