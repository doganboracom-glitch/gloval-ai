import type { BillingProfileDatabaseRow } from '@/lib/billing-profile-store'

export type BillingSnapshot = {
  version: 1
  capturedAt: string
  accountEmail: string | null
  /** false when the customer had no billing profile when the invoice was recorded. */
  profile: boolean
  customerType?: 'individual' | 'company'
  fullName?: string
  companyTitle?: string
  taxOffice?: string
  taxNumber?: string
  nationalId?: string
  addressLine?: string
  district?: string
  city?: string
  postalCode?: string
  country?: string
  phone?: string
  invoiceEmail?: string
  eInvoicePayer?: boolean
}

/**
 * Freezes the customer's billing details as they were when the invoice was
 * recorded. Later profile edits must never rewrite what an issued invoice
 * says, so the invoice keeps this copy. It only ever lives server-side
 * (`invoices.billing_snapshot` has no client grant) and never enters the
 * audit trail.
 */
export function buildBillingSnapshot(
  profile: Partial<BillingProfileDatabaseRow> | null,
  accountEmail: string | null,
  now: Date = new Date(),
): BillingSnapshot {
  const base = { version: 1 as const, capturedAt: now.toISOString(), accountEmail }
  if (!profile) return { ...base, profile: false }
  return {
    ...base,
    profile: true,
    customerType: profile.customer_type,
    fullName: profile.full_name ?? '',
    companyTitle: profile.company_title ?? '',
    taxOffice: profile.tax_office ?? '',
    taxNumber: profile.tax_number ?? '',
    nationalId: profile.national_id ?? '',
    addressLine: profile.address_line ?? '',
    district: profile.district ?? '',
    city: profile.city ?? '',
    postalCode: profile.postal_code ?? '',
    country: profile.country ?? 'TR',
    phone: profile.phone ?? '',
    invoiceEmail: profile.invoice_email ?? '',
    eInvoicePayer: profile.e_invoice_payer ?? false,
  }
}
