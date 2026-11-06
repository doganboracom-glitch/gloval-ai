'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import { isReferralCashPayoutsEnabled, isReferralPayoutsEnabled } from '@/lib/referrals/core'
import { REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'
import { queueReferralPayoutNotification } from '@/lib/referrals/email-outbox'
import type { ReferralPayoutMethod, ReferralVatMode } from '@/lib/referrals/partner-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const PAYOUT_METHODS: readonly ReferralPayoutMethod[] = ['cash', 'credit']
const VAT_MODES: readonly ReferralVatMode[] = ['included', 'added']

type PayoutActionError =
  | 'not_authenticated'
  | 'payout_disabled'
  | 'cash_disabled'
  | 'not_found'
  | 'partner_inactive'
  | 'insufficient_balance'
  | 'minimum_not_met'
  | 'credit_balance_empty'
  | 'terms_required'
  | 'amount_exceeds_balance'
  | 'partial_unavailable_debt'
  | 'vat_mode_required'
  | 'vat_mode_not_allowed'
  | 'feature_unavailable'
  | 'open_cash_request'
  | 'tax_verification_required'
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
      invoiceNetCents: number | null
      invoiceVatCents: number | null
      invoiceGrossCents: number | null
      vatMode: ReferralVatMode | null
      partial: boolean
      taxSuspended: boolean
    }
  | { ok: false; error: PayoutActionError }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function mapRpcError(value: unknown, method: ReferralPayoutMethod, hasIban: boolean): PayoutActionError {
  if (value === 'not_owner' || value === 'not_found') return 'not_found'
  if (value === 'partner_closed') return 'partner_inactive'
  if (value === 'insufficient_balance') return method === 'credit' ? 'credit_balance_empty' : 'insufficient_balance'
  if (value === 'credit_minimum_not_met') return 'credit_balance_empty'
  if (value === 'minimum_not_met') return method === 'credit' ? 'credit_balance_empty' : 'minimum_not_met'
  if (value === 'amount_exceeds_balance') return 'amount_exceeds_balance'
  if (value === 'partial_unavailable_debt') return 'partial_unavailable_debt'
  if (value === 'vat_mode_required') return 'vat_mode_required'
  if (value === 'vat_mode_not_allowed') return 'vat_mode_not_allowed'
  if (value === 'open_cash_request') return 'open_cash_request'
  if (value === 'tax_verification_required') return 'tax_verification_required'
  if (value === 'idempotency_conflict') return 'idempotency_conflict'
  if (value === 'invalid_input') return 'invalid_input'
  if (value === 'credit_amount_out_of_range') return 'credit_unavailable'
  if (value === 'payout_details_missing') return method === 'cash' && !hasIban ? 'missing_iban' : 'invalid_tax_status'
  return 'unavailable'
}

function isMissingPayoutRpc(error: unknown): boolean {
  if (!isRecord(error)) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true
  return typeof error.message === 'string' && /request_referral_payout.*(?:schema cache|does not exist|not found)/iu.test(error.message)
}

function optionalInvoiceCents(data: Record<string, unknown>, key: string): number | null | 'invalid' {
  if (data[key] == null) return null
  return nonNegativeInteger(data[key]) ?? 'invalid'
}

export async function createReferralPayoutRequest(input: {
  method: unknown
  idempotencyKey: unknown
  amountCents?: unknown
  vatMode?: unknown
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

  const hasAmount = input.amountCents !== undefined && input.amountCents !== null
  const amountCents = hasAmount && Number.isSafeInteger(input.amountCents) && Number(input.amountCents) > 0
    ? Number(input.amountCents)
    : null
  if (hasAmount && amountCents === null) return { ok: false, error: 'invalid_input' }

  const hasVatMode = input.vatMode !== undefined && input.vatMode !== null
  const requestVatMode = hasVatMode && typeof input.vatMode === 'string' && VAT_MODES.includes(input.vatMode as ReferralVatMode)
    ? input.vatMode as ReferralVatMode
    : null
  if (hasVatMode && requestVatMode === null) return { ok: false, error: 'invalid_input' }
  if (payoutMethod === 'credit' && requestVatMode !== null) return { ok: false, error: 'vat_mode_not_allowed' }

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return { ok: false, error: 'not_authenticated' }

  try {
    const admin = createAdminClient()
    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('id,status,iban_last4,tax_status,terms_version')
      .eq('user_id', authState.user.id)
      .maybeSingle()

    if (partnerError) return { ok: false, error: 'unavailable' }
    if (!partner) return { ok: false, error: 'not_found' }
    if (partner.status === 'closed') return { ok: false, error: 'partner_inactive' }
    if (partner.terms_version !== REFERRAL_TERMS_VERSION) return { ok: false, error: 'terms_required' }

    if (payoutMethod === 'cash') {
      if (partner.tax_status !== 'individual' && partner.tax_status !== 'company') {
        return { ok: false, error: 'invalid_tax_status' }
      }
      if (partner.tax_status === 'company' && requestVatMode === null && amountCents !== null) {
        return { ok: false, error: 'vat_mode_required' }
      }
      if (partner.tax_status === 'individual' && requestVatMode !== null) {
        return { ok: false, error: 'vat_mode_not_allowed' }
      }
    }

    const usesExtendedRpc = amountCents !== null || requestVatMode !== null
    const rpcArgs = {
      p_partner_id: partner.id,
      p_user_id: authState.user.id,
      p_method: payoutMethod,
      p_idempotency_key: input.idempotencyKey,
      ...(usesExtendedRpc ? { p_amount_cents: amountCents, p_vat_mode: requestVatMode } : {}),
    }
    const { data, error } = await admin.rpc('request_referral_payout', rpcArgs)
    if (error) {
      if (usesExtendedRpc && isMissingPayoutRpc(error)) return { ok: false, error: 'feature_unavailable' }
      return { ok: false, error: 'unavailable' }
    }
    if (!isRecord(data)) return { ok: false, error: 'unavailable' }
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
    const invoiceNetCents = optionalInvoiceCents(data, 'invoiceNetCents')
    const invoiceVatCents = optionalInvoiceCents(data, 'invoiceVatCents')
    const invoiceGrossCents = optionalInvoiceCents(data, 'invoiceGrossCents')
    const vatMode: ReferralVatMode | null =
      data.vatMode === 'included' || data.vatMode === 'added' ? data.vatMode : null
    const hasInvoiceBreakdown = [invoiceNetCents, invoiceVatCents, invoiceGrossCents].some((value) => value !== null)
    if (
      !requestId ||
      balanceCents === null ||
      payoutCents === null ||
      (data.creditAmount != null && creditAmount === null) ||
      invoiceNetCents === 'invalid' ||
      invoiceVatCents === 'invalid' ||
      invoiceGrossCents === 'invalid' ||
      (data.vatMode != null && vatMode === null) ||
      (hasInvoiceBreakdown && (
        invoiceNetCents === null ||
        invoiceVatCents === null ||
        invoiceGrossCents === null ||
        invoiceNetCents + invoiceVatCents !== invoiceGrossCents
      ))
    ) return { ok: false, error: 'unavailable' }

    const partial = data.partial === true
    const lang: 'en' | 'tr' = input.lang === 'en' ? 'en' : 'tr'
    const noticeBase = { partnerId: partner.id, payoutRequestId: requestId, lang }
    if (payoutMethod === 'cash') {
      const noticeAmounts = {
        amountCents: payoutCents,
        commissionCents: balanceCents,
        partial,
        invoiceRequired: data.invoiceRequired === true,
        vatMode,
        invoiceNetCents,
        invoiceVatCents,
        invoiceGrossCents,
      }
      await queueReferralPayoutNotification({
        ...noticeBase,
        ...noticeAmounts,
        type: 'referral_cash_requested',
      })
      await queueReferralPayoutNotification({
        ...noticeBase,
        ...noticeAmounts,
        type: 'referral_cash_admin',
      })
    } else {
      await queueReferralPayoutNotification({
        ...noticeBase,
        type: 'referral_credit_converted',
        commissionCents: balanceCents,
        partial,
        creditAmount: creditAmount ?? undefined,
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
      invoiceNetCents,
      invoiceVatCents,
      invoiceGrossCents,
      vatMode,
      partial,
      taxSuspended: data.taxSuspended === true,
    }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
