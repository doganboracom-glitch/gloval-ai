import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { getBillingProfileCopy, isBillingProfileExportFilter } from '@/lib/billing-profile-copy'
import { serializeCsv } from '@/lib/billing-profile-csv'
import { isBillingProfileRowComplete, toBillingProfileSummary } from '@/lib/billing-profile-store'
import type { BillingProfileDatabaseRow } from '@/lib/billing-profile-store'
import type { BillingProfileCopyLanguage, BillingProfileExportFilter, BillingProfileSummary } from '@/lib/billing-profile-types'

type PlanRelation =
  | { name?: string; price_cents?: number; currency?: string; interval?: string }
  | { name?: string; price_cents?: number; currency?: string; interval?: string }[]
  | null

type SubscriptionRecord = {
  user_id: string
  status: string
  created_at: string
  billing_plans: PlanRelation
}

type ProfileLookupRow = { id: string; email: string | null; full_name: string | null }

type RawAdminBillingProfile = {
  userId: string
  accountEmail: string
  fullName: string
  planName: string
  subscriptionStatus: string
  profile: BillingProfileDatabaseRow | null
}

export type AdminBillingProfileRow = {
  userId: string
  accountEmail: string
  fullName: string
  planName: string
  subscriptionStatus: string
  profile: BillingProfileSummary | null
  complete: boolean
}

export type BillingProfileRevealField = 'national_id' | 'tax_number'
export type BillingProfileAccessHistoryRow = {
  id: string
  createdAt: string
  adminEmail: string
  adminUserId: string
  targetUserId: string
  field: BillingProfileRevealField
}

const revealTimestamps = new Map<string, number[]>()
const revealLimit = 30
const revealWindowMs = 60_000
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type BillingProfileRevealResult =
  | { ok: true; value: string }
  | { ok: false; error: 'unauthorized' | 'invalid_target' | 'invalid_field' | 'rate_limited' | 'audit_failed' | 'unavailable' }

export async function revealAdminBillingProfileIdentifier(
  targetUserIdValue: unknown,
  fieldValue: unknown,
): Promise<BillingProfileRevealResult> {
  const actor = await requireAdmin().catch(() => null)
  if (!actor) return { ok: false, error: 'unauthorized' }
  if (typeof targetUserIdValue !== 'string' || !uuidPattern.test(targetUserIdValue)) return { ok: false, error: 'invalid_target' }
  if (fieldValue !== 'national_id' && fieldValue !== 'tax_number') return { ok: false, error: 'invalid_field' }

  const now = Date.now()
  const recent = (revealTimestamps.get(actor.userId) ?? []).filter((timestamp) => now - timestamp < revealWindowMs)
  if (recent.length >= revealLimit) {
    revealTimestamps.set(actor.userId, recent)
    return { ok: false, error: 'rate_limited' }
  }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('billing_profiles')
    .select('customer_type, national_id, tax_number')
    .eq('user_id', targetUserIdValue)
    .maybeSingle()
  if (profileError || !profile) return { ok: false, error: 'unavailable' }
  if ((fieldValue === 'national_id' && profile.customer_type !== 'individual') || (fieldValue === 'tax_number' && profile.customer_type !== 'company')) {
    return { ok: false, error: 'invalid_field' }
  }
  const value = fieldValue === 'national_id' ? profile.national_id : profile.tax_number
  if (typeof value !== 'string' || !value) return { ok: false, error: 'unavailable' }

  const { error: auditError } = await admin.from('billing_profile_reveal_audit').insert({
    admin_email: actor.email,
    admin_user_id: actor.userId,
    target_user_id: targetUserIdValue,
    field: fieldValue,
  })
  if (auditError) return { ok: false, error: 'audit_failed' }
  revealTimestamps.set(actor.userId, [...recent, now])
  return { ok: true, value }
}

export async function listAdminBillingProfileAccessHistory(limit = 20): Promise<BillingProfileAccessHistoryRow[]> {
  await requireAdmin()
  const { data, error } = await createAdminClient()
    .from('billing_profile_reveal_audit')
    .select('id, created_at, admin_email, admin_user_id, target_user_id, field')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50))
  if (error) return []
  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    adminEmail: row.admin_email,
    adminUserId: row.admin_user_id,
    targetUserId: row.target_user_id,
    field: row.field as BillingProfileRevealField,
  }))
}

export function resetBillingProfileRevealLimiterForTests() {
  revealTimestamps.clear()
}

async function loadPaidSubscriberProfiles(): Promise<{
  available: boolean
  rows: RawAdminBillingProfile[]
}> {
  const admin = createAdminClient()
  const { data: subscriptionData, error: subscriptionError } = await admin
    .from('billing_subscriptions')
    .select('user_id, status, created_at, billing_plans!billing_subscriptions_plan_id_fkey(name, price_cents, currency, interval)')
    .order('created_at', { ascending: false })

  if (subscriptionError) return { available: false, rows: [] }

  const latestByUser = new Map<string, SubscriptionRecord>()
  for (const row of (subscriptionData ?? []) as SubscriptionRecord[]) {
    if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row)
  }

  const paidSubscriptions = [...latestByUser.values()].filter((row) => {
    const relation = Array.isArray(row.billing_plans) ? row.billing_plans[0] : row.billing_plans
    return (
      ['active', 'past_due', 'suspended'].includes(row.status) &&
      typeof relation?.price_cents === 'number' &&
      relation.price_cents > 0
    )
  })

  const userIds = paidSubscriptions.map((row) => row.user_id)
  if (userIds.length === 0) return { available: true, rows: [] }

  const [{ data: profileLookups }, { data: billingProfileRows, error: billingProfilesError }] = await Promise.all([
    admin.from('profiles').select('id, email, full_name').in('id', userIds),
    admin.from('billing_profiles').select('user_id, customer_type, full_name, company_title, tax_office, tax_number, national_id, address_line, district, city, postal_code, country, phone, invoice_email, e_invoice_payer, created_at, updated_at').in('user_id', userIds),
  ])

  if (billingProfilesError) return { available: false, rows: [] }

  const profileByUser = new Map<string, ProfileLookupRow>(
    ((profileLookups ?? []) as ProfileLookupRow[]).map((row) => [row.id, row]),
  )
  const billingProfileByUser = new Map<string, BillingProfileDatabaseRow>(
    ((billingProfileRows ?? []) as BillingProfileDatabaseRow[]).map((row) => [row.user_id, row]),
  )

  const rows = paidSubscriptions.map((subscription) => {
    const relation = Array.isArray(subscription.billing_plans)
      ? subscription.billing_plans[0]
      : subscription.billing_plans
    const profile = profileByUser.get(subscription.user_id)
    return {
      userId: subscription.user_id,
      accountEmail: profile?.email ?? '',
      fullName: profile?.full_name ?? '',
      planName: relation?.name ?? '',
      subscriptionStatus: subscription.status,
      profile: billingProfileByUser.get(subscription.user_id) ?? null,
    }
  })

  rows.sort((a, b) => a.accountEmail.localeCompare(b.accountEmail))
  return { available: true, rows }
}

export async function listAdminBillingProfiles(): Promise<{
  available: boolean
  rows: AdminBillingProfileRow[]
}> {
  await requireAdmin()
  const result = await loadPaidSubscriberProfiles()
  if (!result.available) return { available: false, rows: [] }

  return {
    available: true,
    rows: result.rows.map((row) => {
      const complete = row.profile ? isBillingProfileRowComplete(row.profile) : false
      return {
        userId: row.userId,
        accountEmail: row.accountEmail,
        fullName: row.fullName,
        planName: row.planName,
        subscriptionStatus: row.subscriptionStatus,
        profile: row.profile ? toBillingProfileSummary(row.profile) : null,
        complete,
      }
    }),
  }
}

export type BillingProfileCsvExportResult =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: 'invalid_filter' | 'unavailable' | 'audit_failed' }

export async function exportAdminBillingProfilesCsv(
  filterValue: unknown,
  languageValue: unknown,
): Promise<BillingProfileCsvExportResult> {
  if (!isBillingProfileExportFilter(filterValue)) return { ok: false, error: 'invalid_filter' }
  const language: BillingProfileCopyLanguage = languageValue === 'tr' ? 'tr' : 'en'
  const actor = await requireAdmin()
  const result = await loadPaidSubscriberProfiles()
  if (!result.available) return { ok: false, error: 'unavailable' }

  const selectedRows = result.rows.filter((row) => {
    const complete = row.profile ? isBillingProfileRowComplete(row.profile) : false
    if (filterValue === 'incomplete') return !complete
    if (filterValue === 'complete') return complete
    return true
  })

  const admin = createAdminClient()
  const { error: auditError } = await admin.from('billing_profile_export_audit').insert({
    admin_email: actor.email,
    admin_user_id: actor.userId,
    export_filter: filterValue,
    row_count: selectedRows.length,
  })
  if (auditError) return { ok: false, error: 'audit_failed' }

  const copy = getBillingProfileCopy(language)
  const rows: Array<Array<string | boolean | null>> = [
    [...copy.csvHeaders],
    ...selectedRows.map((row) => {
      const profile = row.profile
      return [
        row.userId,
        row.accountEmail,
        row.planName,
        row.subscriptionStatus,
        profile?.customer_type === 'company' ? copy.company : profile?.customer_type === 'individual' ? copy.individual : '',
        profile?.full_name ?? row.fullName,
        profile?.company_title ?? '',
        profile?.tax_office ?? '',
        profile?.national_id ?? '',
        profile?.tax_number ?? '',
        profile?.invoice_email ?? '',
        profile?.address_line ?? '',
        profile?.district ?? '',
        profile?.city ?? '',
        profile?.postal_code ?? '',
        profile?.country ?? '',
        profile?.phone ?? '',
        profile?.e_invoice_payer ?? false,
        Boolean(profile && isBillingProfileRowComplete(profile)),
        profile?.updated_at ?? '',
      ]
    }),
  ]

  const date = new Date().toISOString().slice(0, 10)
  return {
    ok: true,
    csv: serializeCsv(rows),
    filename: `billing-profiles-${filterValue}-${date}.csv`,
  }
}

export function isAdminBillingProfileFilter(value: unknown): value is BillingProfileExportFilter {
  return isBillingProfileExportFilter(value)
}
