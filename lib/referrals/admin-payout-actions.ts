'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { isReferralCashPayoutsEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { queueReferralPayoutNotification } from '@/lib/referrals/email-outbox'
import { decryptReferralIban } from '@/lib/referrals/partner-encryption'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export type ReferralAdminPayoutActionError =
  | 'payout_disabled'
  | 'cash_disabled'
  | 'invalid_input'
  | 'invalid_reference'
  | 'invalid_note'
  | 'not_found'
  | 'invoice_required'
  | 'invoice_already_recorded'
  | 'transition_conflict'
  | 'missing_iban'
  | 'encryption_unavailable'
  | 'unavailable'

export type ReferralAdminPayoutActionResult =
  | { ok: true; requestId?: string; iban?: string; alreadyProcessed?: boolean; taxSuspended?: boolean }
  | { ok: false; error: ReferralAdminPayoutActionError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validReference(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length >= 2 && normalized.length <= 200 ? normalized : null
}

function parseRpcActionResult(value: unknown): { ok: boolean; error?: string; [key: string]: unknown } | null {
  return isRecord(value) && typeof value.ok === 'boolean'
    ? value as { ok: boolean; error?: string; [key: string]: unknown }
    : null
}

function mapCashActionError(value: unknown): ReferralAdminPayoutActionError {
  if (value === 'not_found' || value === 'partner_not_found') return 'not_found'
  if (value === 'invoice_confirmation_required') return 'invoice_required'
  if (value === 'invoice_already_recorded') return 'invoice_already_recorded'
  if (value === 'invalid_transition' || value === 'transition_conflict') return 'transition_conflict'
  if (value === 'iban_unavailable') return 'missing_iban'
  if (value === 'invalid_invoice_reference' || value === 'invalid_payment_reference') return 'invalid_reference'
  if (value === 'invalid_note') return 'invalid_note'
  return 'unavailable'
}

function refreshReferralSurfaces() {
  revalidatePath('/admin/referrals')
  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

async function payoutFlagsEnabled(): Promise<ReferralAdminPayoutActionResult | null> {
  if (!isReferralPayoutsEnabled()) return { ok: false, error: 'payout_disabled' }
  if (!isReferralCashPayoutsEnabled()) return { ok: false, error: 'cash_disabled' }
  return null
}

export async function recordReferralCashInvoice(input: {
  requestId: unknown
  invoiceReference: unknown
}): Promise<ReferralAdminPayoutActionResult> {
  const adminUser = await requireAdmin()
  const flagError = await payoutFlagsEnabled()
  if (flagError) return flagError
  if (!input || typeof input !== 'object' || typeof input.requestId !== 'string' || !UUID_PATTERN.test(input.requestId)) {
    return { ok: false, error: 'invalid_input' }
  }
  const invoiceReference = validReference(input.invoiceReference)
  if (!invoiceReference) return { ok: false, error: 'invalid_reference' }

  try {
    const { data, error } = await createAdminClient().rpc('record_referral_cash_invoice', {
      p_request_id: input.requestId,
      p_actor_user_id: adminUser.userId,
      p_invoice_reference: invoiceReference,
    })
    if (error) return { ok: false, error: 'unavailable' }
    const result = parseRpcActionResult(data)
    if (!result) return { ok: false, error: 'unavailable' }
    if (!result.ok) return { ok: false, error: mapCashActionError(result.error) }

    refreshReferralSurfaces()
    return { ok: true, requestId: input.requestId }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function processReferralCashPayout(input: {
  requestId: unknown
  paymentReference: unknown
}): Promise<ReferralAdminPayoutActionResult> {
  const adminUser = await requireAdmin()
  const flagError = await payoutFlagsEnabled()
  if (flagError) return flagError
  if (!input || typeof input !== 'object' || typeof input.requestId !== 'string' || !UUID_PATTERN.test(input.requestId)) {
    return { ok: false, error: 'invalid_input' }
  }
  const paymentReference = validReference(input.paymentReference)
  if (!paymentReference) return { ok: false, error: 'invalid_reference' }

  try {
    const { data, error } = await createAdminClient().rpc('process_referral_cash_payout', {
      p_request_id: input.requestId,
      p_actor_user_id: adminUser.userId,
      p_payment_reference: paymentReference,
    })
    if (error) return { ok: false, error: 'unavailable' }
    const result = parseRpcActionResult(data)
    if (!result) return { ok: false, error: 'unavailable' }
    if (!result.ok) return { ok: false, error: mapCashActionError(result.error) }

    const requestId = typeof result.requestId === 'string' && UUID_PATTERN.test(result.requestId)
      ? result.requestId
      : input.requestId
    const partnerId = typeof result.partnerId === 'string' && UUID_PATTERN.test(result.partnerId)
      ? result.partnerId
      : null
    const language: 'en' | 'tr' = result.partnerLanguage === 'en' ? 'en' : 'tr'
    const payoutCents = Number(result.payoutCents)
    if (partnerId && Number.isSafeInteger(payoutCents) && payoutCents >= 0 && result.alreadyProcessed !== true) {
      const base = { partnerId, payoutRequestId: requestId, lang: language, amountCents: payoutCents }
      await queueReferralPayoutNotification({ ...base, type: 'referral_cash_paid' })
      if (result.taxSuspended === true) {
        await queueReferralPayoutNotification({ ...base, type: 'referral_tax_verification_required' })
      }
    }

    refreshReferralSurfaces()
    return {
      ok: true,
      requestId,
      alreadyProcessed: result.alreadyProcessed === true,
      taxSuspended: result.taxSuspended === true,
    }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function rejectReferralCashPayout(input: {
  requestId: unknown
  note: unknown
}): Promise<ReferralAdminPayoutActionResult> {
  const adminUser = await requireAdmin()
  const flagError = await payoutFlagsEnabled()
  if (flagError) return flagError
  if (!input || typeof input !== 'object' || typeof input.requestId !== 'string' || !UUID_PATTERN.test(input.requestId)) {
    return { ok: false, error: 'invalid_input' }
  }
  if (typeof input.note !== 'string' || input.note.trim().length < 3 || input.note.trim().length > 500) {
    return { ok: false, error: 'invalid_note' }
  }

  try {
    const { data, error } = await createAdminClient().rpc('reject_referral_cash_payout', {
      p_request_id: input.requestId,
      p_actor_user_id: adminUser.userId,
      p_reason: 'admin_rejected',
      p_note: input.note.trim(),
    })
    if (error) return { ok: false, error: 'unavailable' }
    const result = parseRpcActionResult(data)
    if (!result) return { ok: false, error: 'unavailable' }
    if (!result.ok) return { ok: false, error: mapCashActionError(result.error) }

    const requestId = typeof result.requestId === 'string' && UUID_PATTERN.test(result.requestId)
      ? result.requestId
      : input.requestId
    const partnerId = typeof result.partnerId === 'string' && UUID_PATTERN.test(result.partnerId)
      ? result.partnerId
      : null
    const language: 'en' | 'tr' = result.partnerLanguage === 'en' ? 'en' : 'tr'
    const amountCents = Number(result.balanceCents)
    if (partnerId && Number.isSafeInteger(amountCents) && amountCents >= 0 && result.alreadyProcessed !== true) {
      await queueReferralPayoutNotification({
        type: 'referral_cash_rejected',
        partnerId,
        payoutRequestId: requestId,
        lang: language,
        amountCents,
      })
    }

    refreshReferralSurfaces()
    return { ok: true, requestId }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function verifyReferralPartnerTax(partnerId: unknown): Promise<ReferralAdminPayoutActionResult> {
  const adminUser = await requireAdmin()
  const flagError = await payoutFlagsEnabled()
  if (flagError) return flagError
  if (typeof partnerId !== 'string' || !UUID_PATTERN.test(partnerId)) {
    return { ok: false, error: 'invalid_input' }
  }

  try {
    const { data, error } = await createAdminClient().rpc('verify_referral_partner_tax', {
      p_partner_id: partnerId,
      p_actor_user_id: adminUser.userId,
    })
    if (error) return { ok: false, error: 'unavailable' }
    const result = parseRpcActionResult(data)
    if (!result) return { ok: false, error: 'unavailable' }
    if (!result.ok) return { ok: false, error: result.error === 'invalid_transition' ? 'transition_conflict' : 'unavailable' }

    refreshReferralSurfaces()
    return { ok: true }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function revealReferralPayoutIban(input: {
  partnerId: unknown
  requestId: unknown
}): Promise<ReferralAdminPayoutActionResult> {
  const adminUser = await requireAdmin()
  const flagError = await payoutFlagsEnabled()
  if (flagError) return flagError
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.partnerId !== 'string' ||
    !UUID_PATTERN.test(input.partnerId) ||
    typeof input.requestId !== 'string' ||
    !UUID_PATTERN.test(input.requestId)
  ) return { ok: false, error: 'invalid_input' }

  try {
    const admin = createAdminClient()
    const { data: payout, error: payoutError } = await admin
      .from('referral_payout_requests')
      .select('id,method,status,partner_id')
      .eq('id', input.requestId)
      .eq('partner_id', input.partnerId)
      .maybeSingle()
    if (payoutError) return { ok: false, error: 'unavailable' }
    if (!payout || payout.method !== 'cash' || payout.status !== 'requested') {
      return { ok: false, error: 'not_found' }
    }

    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('iban_ciphertext,iban_key_version')
      .eq('id', input.partnerId)
      .maybeSingle()
    if (partnerError) return { ok: false, error: 'unavailable' }
    if (!partner?.iban_ciphertext || !partner.iban_key_version) {
      return { ok: false, error: 'missing_iban' }
    }

    const { data: auditRecorded, error: auditError } = await admin.rpc('record_referral_payout_iban_reveal', {
      p_partner_id: input.partnerId,
      p_request_id: input.requestId,
      p_actor_user_id: adminUser.userId,
    })
    if (auditError || auditRecorded !== true) return { ok: false, error: 'unavailable' }

    const decrypted = await decryptReferralIban(partner.iban_ciphertext, partner.iban_key_version)
    if (!decrypted.ok) return { ok: false, error: 'encryption_unavailable' }
    return { ok: true, requestId: input.requestId, iban: decrypted.iban }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export type ReferralAdminCommissionActionError =
  | 'payout_disabled'
  | 'invalid_input'
  | 'invalid_reason'
  | 'not_found'
  | 'unavailable'

export type ReferralAdminCommissionActionResult =
  | { ok: true; commissionId: string; alreadyProcessed: boolean }
  | { ok: false; error: ReferralAdminCommissionActionError }

export async function reverseReferralCommissionManually(input: {
  commissionId: unknown
  reason: unknown
}): Promise<ReferralAdminCommissionActionResult> {
  const adminUser = await requireAdmin()
  if (!isReferralPayoutsEnabled()) return { ok: false, error: 'payout_disabled' }
  if (!input || typeof input !== 'object' || typeof input.commissionId !== 'string' || !UUID_PATTERN.test(input.commissionId)) {
    return { ok: false, error: 'invalid_input' }
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 500) {
    return { ok: false, error: 'invalid_reason' }
  }

  try {
    const { data, error } = await createAdminClient().rpc('referral_admin_reverse_commission', {
      p_commission_id: input.commissionId,
      p_actor_user_id: adminUser.userId,
      p_reason: input.reason.trim(),
    })
    if (error) return { ok: false, error: 'unavailable' }
    const result = parseRpcActionResult(data)
    if (!result) return { ok: false, error: 'unavailable' }
    if (!result.ok) {
      if (result.error === 'invalid_reason') return { ok: false, error: 'invalid_reason' }
      if (result.error === 'not_found') return { ok: false, error: 'not_found' }
      return { ok: false, error: 'unavailable' }
    }

    refreshReferralSurfaces()
    return {
      ok: true,
      commissionId: typeof result.commissionId === 'string' && UUID_PATTERN.test(result.commissionId)
        ? result.commissionId
        : input.commissionId,
      alreadyProcessed: result.alreadyProcessed === true,
    }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
