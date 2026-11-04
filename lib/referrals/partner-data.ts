import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { maskEmail } from '@/lib/store-order-privacy'
import { isReferralFeatureEnabled, normalizeReferralCode } from '@/lib/referrals/core'
import type {
  ReferralAdminPartner,
  ReferralCustomer,
  ReferralCustomerStatus,
  ReferralDashboardData,
  ReferralPartnerSettings,
  ReferralPartnerStatus,
  ReferralPartnerStatusEvent,
} from '@/lib/referrals/partner-types'

type ReferralRpcRow = {
  partnerId?: unknown
  referralCode?: unknown
  status?: unknown
  activatedAt?: unknown
  lastStatusChangedAt?: unknown
  ibanLast4?: unknown
  email?: unknown
  clicks?: unknown
  signups?: unknown
  verifiedSignups?: unknown
  paidCustomers?: unknown
  customers?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function rpcRows(value: unknown): ReferralRpcRow[] {
  const rows = Array.isArray(value) ? value : isRecord(value) ? [value] : []
  return rows.filter(isRecord) as ReferralRpcRow[]
}

function partnerStatus(value: unknown): ReferralPartnerStatus | null {
  return value === 'active' || value === 'suspended' || value === 'closed' ? value : null
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function dateString(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null
  return value
}

function lastFour(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}$/u.test(value) ? value : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null
}

function customerStatus(value: unknown): ReferralCustomerStatus {
  return value === 'paid' || value === 'verified' ? value : 'signup'
}

export function mapReferralDashboardRpcResult(value: unknown): ReferralDashboardData | null {
  const row = rpcRows(value).find((candidate) => candidate.status === 'active')
  const referralCode = normalizeReferralCode(typeof row?.referralCode === 'string' ? row.referralCode : null)
  if (!row || !referralCode) return null

  const customers: ReferralCustomer[] = (Array.isArray(row.customers) ? row.customers : [])
    .filter(isRecord)
    .map((customer) => ({
      maskedEmail: maskEmail(typeof customer.email === 'string' ? customer.email : null),
      status: customerStatus(customer.status),
      createdAt: dateString(customer.createdAt) ?? '',
    }))
    .filter((customer) => customer.createdAt)

  return {
    referralCode,
    clicks: count(row.clicks),
    signups: count(row.signups),
    verifiedSignups: count(row.verifiedSignups),
    paidCustomers: count(row.paidCustomers),
    customers,
  }
}

export function mapReferralAdminRpcResult(value: unknown): ReferralAdminPartner[] {
  return rpcRows(value)
    .map((row) => {
      const partnerId = uuid(row.partnerId)
      const referralCode = normalizeReferralCode(
        typeof row.referralCode === 'string' ? row.referralCode : null,
      )
      const status = partnerStatus(row.status)
      const activatedAt = dateString(row.activatedAt)
      if (!partnerId || !referralCode || !status || !activatedAt) return null

      return {
        partnerId,
        referralCode,
        status,
        maskedEmail: maskEmail(typeof row.email === 'string' ? row.email : null),
        activatedAt,
        lastStatusChangedAt: dateString(row.lastStatusChangedAt) ?? activatedAt,
        ibanLast4: lastFour(row.ibanLast4),
        clicks: count(row.clicks),
        signups: count(row.signups),
        verifiedSignups: count(row.verifiedSignups),
        paidCustomers: count(row.paidCustomers),
      }
    })
    .filter((row): row is ReferralAdminPartner => row !== null)
}

export async function getReferralPartnerForCurrentUser(): Promise<ReferralPartnerSettings | null> {
  if (!isReferralFeatureEnabled()) return null

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return null

  try {
    const { data, error } = await createAdminClient()
      .from('referral_partners')
      .select('referral_code,status,iban_last4')
      .eq('user_id', authState.user.id)
      .maybeSingle()

    if (error || !data) return null
    const referralCode = normalizeReferralCode(data.referral_code)
    const status = partnerStatus(data.status)
    if (!referralCode || !status) return null

    return { referralCode, status, ibanLast4: lastFour(data.iban_last4) }
  } catch {
    return null
  }
}

export async function getReferralDashboardData(): Promise<ReferralDashboardData | null> {
  if (!isReferralFeatureEnabled()) return null

  const authState = await getRequestUser()
  if (authState.kind !== 'authenticated') return null

  try {
    const { data, error } = await createAdminClient().rpc('referral_partner_dashboard', {
      p_user_id: authState.user.id,
      p_include_customers: true,
    })
    if (error) return null
    return mapReferralDashboardRpcResult(data)
  } catch {
    return null
  }
}

export async function getReferralAdminSummary(): Promise<ReferralAdminPartner[] | null> {
  await requireAdmin()
  if (!isReferralFeatureEnabled()) return null

  try {
    const { data, error } = await createAdminClient().rpc('referral_partner_admin_summary', {})
    if (error) return null
    return mapReferralAdminRpcResult(data)
  } catch {
    return null
  }
}

export async function getReferralPartnerEventHistory(
  partnerId: string,
): Promise<ReferralPartnerStatusEvent[] | null> {
  await requireAdmin()
  if (!isReferralFeatureEnabled() || !uuid(partnerId)) return null

  try {
    const { data, error } = await createAdminClient()
      .from('referral_partner_events')
      .select('id,actor_user_id,action,from_status,to_status,created_at')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !Array.isArray(data)) return null

    return data.flatMap((row) => {
      const id = uuid(row.id)
      const action = row.action === 'suspend' || row.action === 'reactivate' || row.action === 'close'
        ? row.action
        : null
      const fromStatus = partnerStatus(row.from_status)
      const toStatus = partnerStatus(row.to_status)
      const createdAt = dateString(row.created_at)
      if (!id || !action || !fromStatus || !toStatus || !createdAt) return []

      return [{
        id,
        actorUserId: uuid(row.actor_user_id),
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
