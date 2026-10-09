import type { BillingCustomerType, BillingProfileField } from '@/lib/billing-profile-types'

const CONSTRAINT_FIELDS: Record<string, BillingProfileField | 'identity'> = {
  billing_profiles_customer_type_check: 'customerType',
  billing_profiles_full_name_check: 'fullName',
  billing_profiles_company_title_check: 'companyTitle',
  billing_profiles_tax_office_check: 'taxOffice',
  billing_profiles_customer_identity_check: 'identity',
  billing_profiles_address_check: 'addressLine',
  billing_profiles_district_check: 'district',
  billing_profiles_city_check: 'city',
  billing_profiles_postal_code_check: 'postalCode',
  billing_profiles_country_check: 'country',
  billing_profiles_phone_check: 'phone',
  billing_profiles_invoice_email_check: 'invoiceEmail',
}

/** Extracts the constraint name from a Postgres error message; never returns row data. */
export function parseConstraintName(message: unknown): string | null {
  if (typeof message !== 'string') return null
  const match = /constraint "([a-z0-9_]{1,63})"/i.exec(message)
  return match ? match[1] : null
}

/** Maps a violated constraint to exactly one form field, or null when it is unknown. */
export function fieldForConstraint(
  constraint: string | null,
  customerType: BillingCustomerType,
): BillingProfileField | null {
  if (!constraint) return null
  const field = Object.prototype.hasOwnProperty.call(CONSTRAINT_FIELDS, constraint) ? CONSTRAINT_FIELDS[constraint] : null
  if (!field) return null
  if (field === 'identity') return customerType === 'company' ? 'taxNumber' : 'nationalId'
  return field
}

const PAYLOAD_LOG_KEYS: readonly [BillingProfileField, string][] = [
  ['customerType', 'customer_type'],
  ['fullName', 'full_name'],
  ['companyTitle', 'company_title'],
  ['taxOffice', 'tax_office'],
  ['nationalId', 'national_id'],
  ['taxNumber', 'tax_number'],
  ['addressLine', 'address_line'],
  ['district', 'district'],
  ['city', 'city'],
  ['postalCode', 'postal_code'],
  ['country', 'country'],
  ['phone', 'phone'],
  ['invoiceEmail', 'invoice_email'],
  ['eInvoicePayer', 'e_invoice_payer'],
]

/** Log line stating only whether each key arrived non-empty; never any value. */
export function payloadPresenceLog(input: unknown): string {
  const source = typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const parts = PAYLOAD_LOG_KEYS.map(([key, column]) => {
    const value = source[key]
    const present = typeof value === 'string' ? value.trim().length > 0 : typeof value === 'boolean'
    return `${column}:${present}`
  })
  return `[billing-profile] payload present=${parts.join(',')}`
}

/** Log line containing field NAMES only. */
export function validationFailureLog(fieldErrors: Record<string, unknown>): string {
  return `[billing-profile] validation_failed fields=${Object.keys(fieldErrors).sort().join(',') || 'none'}`
}

/** Log line containing the Postgres code and constraint name only. */
export function saveFailureLog(error: { code?: unknown; message?: unknown }): string {
  const code = typeof error.code === 'string' && /^[0-9A-Za-z]{1,10}$/.test(error.code) ? error.code : 'unknown'
  return `[billing-profile] save_failed code=${code} constraint=${parseConstraintName(error.message) ?? 'none'}`
}
