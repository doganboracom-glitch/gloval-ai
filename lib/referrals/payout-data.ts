import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { maskEmail } from '@/lib/store-order-privacy'
import { isReferralPayoutsEnabled } from '@/lib/referrals/core'
import type {
  ReferralPartnerStatus,
  ReferralCommissionAdminRow,
  ReferralCommissionAdminStatus,
  ReferralPayoutAdminRequest,
  ReferralPayoutAdminSummary,
  ReferralPayoutMethod,
  ReferralPayoutPanelData,
  ReferralPayoutState,
  ReferralPayoutStatus,
  ReferralTaxStatus,
} from '@/lib/referrals/partner-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rpcRows(value: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(value) ? value : isRecord(value) ? [value] : []
  return rows.filter(isRecord)
}

function safeInteger(value: unknown, allowNegative = false): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || (!allowNegative && parsed < 0)) return null
  return parsed
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null
}

function dateString(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}

function partnerStatus(value: unknown): ReferralPartnerStatus | null {
  return value === 'active' || value === 'suspended' || value === 'closed' ? value : null
}

function taxStatus(value: unknown): ReferralTaxStatus | null {
  return value === 'individual' || value === 'company' ? value : null
}

function payoutMethod(value: unknown): ReferralPayoutMethod | null {
  return value === 'cash' || value === 'credit' ? value : null
}

function payoutStatus(value: unknown): ReferralPayoutStatus | null {
  return value === 'requested' || value === 'processed' || value === 'rejected'
    ? value
    : null
}

function lastFour(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}$/u.test(value) ? value : null
}

export async function getReferralPayoutPanelData(): Promise<ReferralPayoutPanelData | null> {
  if (!isReferralPayoutsEnabled()) return null

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return null

  const admin = createAdminClient()
  try {
    const { data: partner, error: partnerError } = await admin
      .from('referral_partners')
      .select('id,status,tax_status,iban_last4,tax_verified_at')
      .eq('user_id', authState.user.id)
      .maybeSingle()

    if (partnerError || !partner) return null

    const status = partnerStatus(partner.status)
    if (!status) return null
    if (status === 'closed') return { state: null, unavailable: false }

    const tax = taxStatus(partner.tax_status)
    const syncResult = await admin.rpc('referral_sync_commissions', { p_partner_id: partner.id })
    if (syncResult.error) return { state: null, unavailable: true }

    const { data, error } = await admin.rpc('referral_partner_payout_balance', {
      p_partner_id: partner.id,
    })
    if (error) return { state: null, unavailable: true }

    const row = rpcRows(data)[0]
    if (!row) return { state: null, unavailable: true }

    const pendingCents = safeInteger(row.pendingCents, true)
    const availableCents = safeInteger(row.availableCents, true)
    const convertibleCents = row.convertibleCents == null
      ? availableCents
      : safeInteger(row.convertibleCents, true)
    const requestedCents = safeInteger(row.requestedCents) ?? 0
    const convertedCents = safeInteger(row.convertedCents) ?? 0
    const paidCents = safeInteger(row.paidCents) ?? 0
    if (pendingCents === null || availableCents === null || convertibleCents === null) {
      return { state: null, unavailable: true }
    }

    const state: ReferralPayoutState = {
      partnerStatus: status,
      taxStatus: tax,
      taxVerified: typeof partner.tax_verified_at === 'string' && Number.isFinite(Date.parse(partner.tax_verified_at)),
      hasIban: lastFour(partner.iban_last4) !== null,
      pendingCents,
      availableCents,
      totalCents: pendingCents + availableCents,
      convertibleCents,
      requestedCents,
      convertedCents,
      paidCents,
      hasOpenCashRequest: row.hasOpenCashRequest === true,
    }

    if (!Number.isSafeInteger(state.totalCents)) return { state: null, unavailable: true }
    return { state, unavailable: false }
  } catch {
    return { state: null, unavailable: true }
  }
}

export function mapReferralPayoutAdminList(value: unknown): ReferralPayoutAdminRequest[] {
  return rpcRows(value)
    .map((row) => {
      const requestId = uuid(row.requestId)
      const partnerId = uuid(row.partnerId)
      const referralCode = typeof row.referralCode === 'string' ? row.referralCode : null
      const status = payoutStatus(row.status)
      const method = payoutMethod(row.method)
      const partnerState = partnerStatus(row.partnerStatus)
      const requestedAt = dateString(row.requestedAt)
      const balanceCents = safeInteger(row.balanceCents)
      const payoutCents = safeInteger(row.payoutCents)
      const systemTopupCents = safeInteger(row.systemTopupCents)
      const creditAmount = row.creditAmount == null ? null : safeInteger(row.creditAmount)

      if (
        !requestId ||
        !partnerId ||
        !referralCode ||
        !status ||
        !method ||
        !partnerState ||
        !requestedAt ||
        balanceCents === null ||
        payoutCents === null ||
        systemTopupCents === null ||
        (row.creditAmount != null && creditAmount === null)
      ) return null

      return {
        requestId,
        partnerId,
        referralCode,
        partnerStatus: partnerState,
        maskedEmail: maskEmail(typeof row.email === 'string' ? row.email : null),
        payeeName: typeof row.payeeName === 'string' ? row.payeeName.slice(0, 120) : null,
        taxStatus: taxStatus(row.taxStatus),
        taxVerifiedAt: dateString(row.taxVerifiedAt),
        ibanLast4: lastFour(row.ibanLast4),
        method,
        balanceCents,
        payoutCents,
        creditAmount,
        systemTopupCents,
        invoiceRequired: row.invoiceRequired === true,
        invoiceConfirmed: row.invoiceConfirmed === true,
        invoiceReference: typeof row.invoiceReference === 'string' ? row.invoiceReference.slice(0, 200) : null,
        invoiceReceivedAt: dateString(row.invoiceReceivedAt),
        paymentReference: typeof row.paymentReference === 'string' ? row.paymentReference.slice(0, 200) : null,
        adminNote: typeof row.adminNote === 'string' ? row.adminNote.slice(0, 500) : null,
        status,
        requestedAt,
        processedAt: dateString(row.processedAt),
        rejectionReason: typeof row.rejectionReason === 'string' ? row.rejectionReason.slice(0, 80) : null,
      }
    })
    .filter((row): row is ReferralPayoutAdminRequest => row !== null)
}

export async function getReferralPayoutAdminRequests(): Promise<ReferralPayoutAdminRequest[] | null> {
  await requireAdmin()
  if (!isReferralPayoutsEnabled()) return null

  try {
    const { data, error } = await createAdminClient().rpc('referral_payout_admin_list', {
      p_status: null,
      p_query: null,
      p_limit: 100,
    })
    if (error) return null
    return mapReferralPayoutAdminList(data)
  } catch {
    return null
  }
}

export function mapReferralPayoutAdminSummary(value: unknown): ReferralPayoutAdminSummary | null {
  const row = rpcRows(value)[0]
  if (!row) return null

  const pendingCents = safeInteger(row.pendingCents, true)
  const availableCents = safeInteger(row.availableCents, true)
  const convertedCents = safeInteger(row.convertedCents)
  const systemTopupCents = safeInteger(row.systemTopupCents)
  const paidCents = safeInteger(row.paidCents)
  const openCashRequests = safeInteger(row.openCashRequests)
  if (
    pendingCents === null ||
    availableCents === null ||
    convertedCents === null ||
    systemTopupCents === null ||
    paidCents === null ||
    openCashRequests === null
  ) return null

  return { pendingCents, availableCents, convertedCents, systemTopupCents, paidCents, openCashRequests }
}

export async function getReferralPayoutAdminSummary(): Promise<ReferralPayoutAdminSummary | null> {
  await requireAdmin()
  if (!isReferralPayoutsEnabled()) return null

  try {
    const { data, error } = await createAdminClient().rpc('referral_payout_admin_summary')
    if (error) return null
    return mapReferralPayoutAdminSummary(data)
  } catch {
    return null
  }
}

function commissionAdminStatus(value: unknown): ReferralCommissionAdminStatus | null {
  return value === 'pending' || value === 'available' || value === 'requested' || value === 'converted' || value === 'paid'
    ? value
    : null
}

export function mapReferralCommissionAdminList(value: unknown): ReferralCommissionAdminRow[] {
  return rpcRows(value)
    .map((row) => {
      const commissionId = uuid(row.commissionId)
      const partnerId = uuid(row.partnerId)
      const referralCode = typeof row.referralCode === 'string' && row.referralCode.trim()
        ? row.referralCode.slice(0, 80)
        : null
      const commissionCents = safeInteger(row.commissionCents)
      const status = commissionAdminStatus(row.status)
      const paidAt = dateString(row.paidAt)
      const availableAt = dateString(row.availableAt)

      if (
        !commissionId ||
        !partnerId ||
        !referralCode ||
        commissionCents === null ||
        commissionCents === 0 ||
        !status ||
        !paidAt ||
        !availableAt
      ) return null

      return { commissionId, partnerId, referralCode, commissionCents, status, paidAt, availableAt }
    })
    .filter((row): row is ReferralCommissionAdminRow => row !== null)
}

export async function getReferralCommissionAdminRows(): Promise<ReferralCommissionAdminRow[] | null> {
  await requireAdmin()
  if (!isReferralPayoutsEnabled()) return null

  try {
    const { data, error } = await createAdminClient().rpc('referral_commission_admin_list', {
      p_limit: 100,
    })
    if (error) return null
    return mapReferralCommissionAdminList(data)
  } catch {
    return null
  }
}
