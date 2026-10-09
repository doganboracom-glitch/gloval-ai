import type {
  BillingProfileField,
  BillingProfileFieldErrors,
  BillingProfileFormValues,
  BillingProfileValidationError,
} from '@/lib/billing-profile-types'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type ExistingBillingIdentifiers = {
  existingNationalId?: string | null
  existingTaxNumber?: string | null
  hasSavedNationalId?: boolean
  hasSavedTaxNumber?: boolean
}

export type BillingProfileValidationResult =
  | { ok: true; value: BillingProfileFormValues }
  | { ok: false; fieldErrors: BillingProfileFieldErrors }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(
  source: Record<string, unknown>,
  field: BillingProfileField,
  fieldErrors: BillingProfileFieldErrors,
): string {
  const value = source[field]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    fieldErrors[field] = 'invalid'
    return ''
  }
  return value.trim()
}

function checkRequiredText(
  value: string,
  field: BillingProfileField,
  fieldErrors: BillingProfileFieldErrors,
  minLength: number,
  maxLength: number,
): string {
  if (!value) fieldErrors[field] = 'required'
  else if (value.length < minLength) fieldErrors[field] = 'invalid'
  else if (value.length > maxLength) fieldErrors[field] = 'too_long'
  return value
}

function checkOptionalText(
  value: string,
  field: BillingProfileField,
  fieldErrors: BillingProfileFieldErrors,
  maxLength: number,
): string {
  if (value.length > maxLength) fieldErrors[field] = 'too_long'
  return value
}

function normalizeIdentifier(value: string, field: BillingProfileField, errors: BillingProfileFieldErrors): string {
  const compact = value.replace(/[\s-]/g, '')
  if (compact && !/^\d+$/.test(compact)) errors[field] = 'invalid'
  return compact
}

export function isValidTurkishNationalId(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false
  if (/^(\d)\1{10}$/.test(value)) return false

  const digits = value.split('').map(Number)
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7]
  const tenthDigit = ((oddSum * 7 - evenSum) % 10 + 10) % 10
  const firstTenSum = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0)

  return digits[9] === tenthDigit && digits[10] === firstTenSum % 10
}

export function isValidTurkishTaxNumber(value: string): boolean {
  return /^\d{10}$/.test(value)
}

export function normalizeBillingPhone(value: string, country: string): string | null {
  const compact = value.trim().replace(/[\s().-]/g, '')
  if (!/^\+?\d+$/.test(compact)) return null

  if (country === 'TR') {
    const digits = compact.replace(/\D/g, '')
    const national =
      digits.length === 12 && digits.startsWith('90')
        ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0')
          ? digits.slice(1)
          : digits.length === 10
            ? digits
            : ''
    return /^[2-5]\d{9}$/.test(national) ? `+90${national}` : null
  }

  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}

export function validateBillingProfileInput(
  input: unknown,
  existing: ExistingBillingIdentifiers = {},
): BillingProfileValidationResult {
  const fieldErrors: BillingProfileFieldErrors = {}
  const source = isRecord(input) ? input : {}
  if (!isRecord(input)) fieldErrors.customerType = 'invalid'

  const customerType = source.customerType
  if (customerType !== 'individual' && customerType !== 'company') {
    fieldErrors.customerType = 'required'
  }

  const fullName = readString(source, 'fullName', fieldErrors)
  const companyTitle = readString(source, 'companyTitle', fieldErrors)
  const taxOffice = readString(source, 'taxOffice', fieldErrors)
  const rawNationalId = readString(source, 'nationalId', fieldErrors)
  const rawTaxNumber = readString(source, 'taxNumber', fieldErrors)
  const addressLine = readString(source, 'addressLine', fieldErrors)
  const district = readString(source, 'district', fieldErrors)
  const city = readString(source, 'city', fieldErrors)
  const postalCode = readString(source, 'postalCode', fieldErrors)
  const rawCountry = readString(source, 'country', fieldErrors)
  const rawPhone = readString(source, 'phone', fieldErrors)
  const invoiceEmail = readString(source, 'invoiceEmail', fieldErrors).toLowerCase()

  const normalizedCountry = (rawCountry || 'TR').toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalizedCountry)) fieldErrors.country = 'invalid'

  const normalizedPhone = normalizeBillingPhone(rawPhone, normalizedCountry)
  if (!normalizedPhone) fieldErrors.phone = rawPhone ? 'invalid' : 'required'

  if (!invoiceEmail) fieldErrors.invoiceEmail = 'required'
  else if (invoiceEmail.length > 254 || !EMAIL_PATTERN.test(invoiceEmail)) fieldErrors.invoiceEmail = 'invalid'

  checkRequiredText(addressLine, 'addressLine', fieldErrors, 5, 240)
  checkRequiredText(district, 'district', fieldErrors, 2, 100)
  checkRequiredText(city, 'city', fieldErrors, 2, 100)
  checkOptionalText(postalCode, 'postalCode', fieldErrors, 20)

  if (customerType === 'individual') {
    checkRequiredText(fullName, 'fullName', fieldErrors, 2, 160)
    checkOptionalText(companyTitle, 'companyTitle', fieldErrors, 200)
    checkOptionalText(taxOffice, 'taxOffice', fieldErrors, 120)
  } else if (customerType === 'company') {
    if (fullName && fullName.length < 2) fieldErrors.fullName = 'invalid'
    checkOptionalText(fullName, 'fullName', fieldErrors, 160)
    checkRequiredText(companyTitle, 'companyTitle', fieldErrors, 2, 200)
    checkRequiredText(taxOffice, 'taxOffice', fieldErrors, 2, 120)
  }

  const nationalIdInput = normalizeIdentifier(rawNationalId, 'nationalId', fieldErrors)
  const taxNumberInput = normalizeIdentifier(rawTaxNumber, 'taxNumber', fieldErrors)
  let nationalId: string | null = null
  let taxNumber: string | null = null

  if (customerType === 'individual') {
    nationalId = nationalIdInput || existing.existingNationalId || null
    if (!nationalId && !existing.hasSavedNationalId) fieldErrors.nationalId = 'required'
    else if (nationalId && !isValidTurkishNationalId(nationalId)) fieldErrors.nationalId = 'invalid'
  } else if (customerType === 'company') {
    taxNumber = taxNumberInput || existing.existingTaxNumber || null
    if (!taxNumber && !existing.hasSavedTaxNumber) fieldErrors.taxNumber = 'required'
    else if (taxNumber && !isValidTurkishTaxNumber(taxNumber)) fieldErrors.taxNumber = 'invalid'
  }

  const eInvoicePayer = source.eInvoicePayer === undefined ? false : source.eInvoicePayer
  if (typeof eInvoicePayer !== 'boolean') fieldErrors.eInvoicePayer = 'invalid'

  if (Object.keys(fieldErrors).length > 0 || !normalizedPhone || (customerType !== 'individual' && customerType !== 'company')) {
    return { ok: false, fieldErrors }
  }

  return {
    ok: true,
    value: {
      customerType,
      fullName,
      companyTitle: customerType === 'company' ? companyTitle : '',
      taxOffice: customerType === 'company' ? taxOffice : '',
      nationalId: customerType === 'individual' ? nationalId ?? '' : '',
      taxNumber: customerType === 'company' ? taxNumber ?? '' : '',
      addressLine,
      district,
      city,
      postalCode,
      country: normalizedCountry,
      phone: normalizedPhone,
      invoiceEmail,
      eInvoicePayer: eInvoicePayer as boolean,
    },
  }
}

export function isBillingProfileComplete(input: unknown): boolean {
  return validateBillingProfileInput(input).ok
}

export function maskIdentifier(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(-3)
}

export function validationErrorForField(
  fieldErrors: BillingProfileFieldErrors,
  field: BillingProfileField,
): BillingProfileValidationError | null {
  return fieldErrors[field] ?? null
}
