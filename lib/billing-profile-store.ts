import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isBillingProfileComplete, maskIdentifier } from '@/lib/billing-profile-validation'
import type { BillingProfileSummary } from '@/lib/billing-profile-types'

export type BillingProfileDatabaseRow = {
  user_id: string
  customer_type: 'individual' | 'company'
  full_name: string | null
  company_title: string | null
  tax_office: string | null
  tax_number: string | null
  national_id: string | null
  address_line: string
  district: string
  city: string
  postal_code: string | null
  country: string
  phone: string
  invoice_email: string
  e_invoice_payer: boolean
  created_at: string
  updated_at: string
}

export const BILLING_PROFILE_COLUMNS =
  'user_id, customer_type, full_name, company_title, tax_office, tax_number, national_id, address_line, district, city, postal_code, country, phone, invoice_email, e_invoice_payer, created_at, updated_at'

const BILLING_PROFILE_COMPLETION_COLUMNS =
  'customer_type, full_name, company_title, tax_office, tax_number, national_id, address_line, district, city, country, phone, invoice_email, e_invoice_payer'

function rowAsForm(row: Partial<BillingProfileDatabaseRow>) {
  return {
    customerType: row.customer_type,
    fullName: row.full_name ?? '',
    companyTitle: row.company_title ?? '',
    taxOffice: row.tax_office ?? '',
    nationalId: row.national_id ?? '',
    taxNumber: row.tax_number ?? '',
    addressLine: row.address_line ?? '',
    district: row.district ?? '',
    city: row.city ?? '',
    postalCode: row.postal_code ?? '',
    country: row.country ?? 'TR',
    phone: row.phone ?? '',
    invoiceEmail: row.invoice_email ?? '',
    eInvoicePayer: row.e_invoice_payer ?? false,
  }
}

export function isBillingProfileRowComplete(row: Partial<BillingProfileDatabaseRow>): boolean {
  return isBillingProfileComplete(rowAsForm(row))
}

export function toBillingProfileSummary(row: BillingProfileDatabaseRow): BillingProfileSummary {
  return {
    customerType: row.customer_type,
    fullName: row.full_name ?? '',
    companyTitle: row.company_title ?? '',
    taxOffice: row.tax_office ?? '',
    addressLine: row.address_line,
    district: row.district,
    city: row.city,
    postalCode: row.postal_code ?? '',
    country: row.country,
    phone: row.phone,
    invoiceEmail: row.invoice_email,
    eInvoicePayer: row.e_invoice_payer,
    hasNationalId: Boolean(row.national_id),
    nationalIdLast3: maskIdentifier(row.national_id),
    hasTaxNumber: Boolean(row.tax_number),
    taxNumberLast3: maskIdentifier(row.tax_number),
    complete: isBillingProfileRowComplete(row),
    updatedAt: row.updated_at,
  }
}

export async function getBillingProfileForUser(userId: string): Promise<{
  available: boolean
  profile: BillingProfileSummary | null
}> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('billing_profiles')
      .select(BILLING_PROFILE_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return { available: false, profile: null }
    return {
      available: true,
      profile: data ? toBillingProfileSummary(data as BillingProfileDatabaseRow) : null,
    }
  } catch {
    return { available: false, profile: null }
  }
}

export async function getBillingProfileStatusForUser(userId: string): Promise<{
  available: boolean
  complete: boolean
}> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('billing_profiles')
      .select(BILLING_PROFILE_COMPLETION_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) return { available: false, complete: false }
    return {
      available: true,
      complete: data ? isBillingProfileRowComplete(data as Partial<BillingProfileDatabaseRow>) : false,
    }
  } catch {
    return { available: false, complete: false }
  }
}

export async function isBillingProfileIncompleteForNotice(userId: string): Promise<boolean> {
  const status = await getBillingProfileStatusForUser(userId)
  return status.available && !status.complete
}
