export type BillingCustomerType = 'individual' | 'company'

export type BillingProfileFormValues = {
  customerType: BillingCustomerType
  fullName: string
  companyTitle: string
  taxOffice: string
  nationalId: string
  taxNumber: string
  addressLine: string
  district: string
  city: string
  postalCode: string
  country: string
  phone: string
  invoiceEmail: string
  eInvoicePayer: boolean
}

export type BillingProfileSummary = Omit<BillingProfileFormValues, 'nationalId' | 'taxNumber'> & {
  hasNationalId: boolean
  nationalIdLast3: string | null
  hasTaxNumber: boolean
  taxNumberLast3: string | null
  complete: boolean
  updatedAt: string
}

export type BillingProfileField = keyof BillingProfileFormValues
export type BillingProfileValidationError = 'required' | 'invalid' | 'too_long'
export type BillingProfileFieldErrors = Partial<Record<BillingProfileField, BillingProfileValidationError>>

export type BillingProfileExportFilter = 'all' | 'incomplete' | 'complete'
export type BillingProfileCopyLanguage = 'tr' | 'en'

export const EMPTY_BILLING_PROFILE_FORM: BillingProfileFormValues = {
  customerType: 'individual',
  fullName: '',
  companyTitle: '',
  taxOffice: '',
  nationalId: '',
  taxNumber: '',
  addressLine: '',
  district: '',
  city: '',
  postalCode: '',
  country: 'TR',
  phone: '',
  invoiceEmail: '',
  eInvoicePayer: false,
}
