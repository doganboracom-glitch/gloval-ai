import { describe, expect, it } from 'vitest'
import { appendBillingProfileReminder, billingProfileReminderText, getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { buildCreditNotice, parseCreditNoticeAmount } from '@/lib/credit-notice'
import {
  fieldForConstraint,
  parseConstraintName,
  saveFailureLog,
  validationFailureLog,
} from '@/lib/billing-profile-save-errors'
import { escapeCsvCell, serializeCsv } from '@/lib/billing-profile-csv'
import {
  isBillingProfileComplete,
  isValidTurkishNationalId,
  isValidTurkishTaxNumber,
  normalizeBillingPhone,
  pickKnownFieldErrors,
  validateBillingProfileInput,
} from '@/lib/billing-profile-validation'

const validIndividual = {
  customerType: 'individual',
  fullName: 'Ayşe Yılmaz',
  companyTitle: '',
  taxOffice: '',
  nationalId: '10000000146',
  taxNumber: '',
  addressLine: 'Atatürk Caddesi No: 10',
  district: 'Kadıköy',
  city: 'İstanbul',
  postalCode: '34710',
  country: 'TR',
  phone: '+90 (212) 555 10 10',
  invoiceEmail: 'ayse@example.com',
  eInvoicePayer: false,
}

const validCompany = {
  ...validIndividual,
  customerType: 'company',
  fullName: 'Ayşe Yılmaz',
  companyTitle: 'Örnek Yazılım A.Ş.',
  taxOffice: 'Kadıköy',
  nationalId: '',
  taxNumber: '1234567890',
}

describe('Turkish billing identifiers and phone normalization', () => {
  it('validates the Turkish national ID checksum', () => {
    expect(isValidTurkishNationalId('10000000146')).toBe(true)
    expect(isValidTurkishNationalId('10000000147')).toBe(false)
    expect(isValidTurkishNationalId('00000000146')).toBe(false)
    expect(isValidTurkishNationalId('11111111111')).toBe(false)
  })

  it('requires ten numeric digits for a Turkish tax ID', () => {
    expect(isValidTurkishTaxNumber('1234567890')).toBe(true)
    expect(isValidTurkishTaxNumber('123456789')).toBe(false)
    expect(isValidTurkishTaxNumber('123456789A')).toBe(false)
  })

  it('normalizes Turkish landline and mobile phone formats to E.164', () => {
    expect(normalizeBillingPhone('0212 555 10 10', 'TR')).toBe('+902125551010')
    expect(normalizeBillingPhone('+90 (532) 555-12-34', 'TR')).toBe('+905325551234')
    expect(normalizeBillingPhone('1234567890', 'TR')).toBe('+901234567890')
    expect(normalizeBillingPhone('(542) 464-76-10', 'TR')).toBe('+905424647610')
    expect(normalizeBillingPhone('abc', 'TR')).toBeNull()
  })
})

describe('billing profile validation', () => {
  it('accepts an individual profile with valid required details', () => {
    const result = validateBillingProfileInput(validIndividual)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.phone).toBe('+902125551010')
  })

  it('rejects invalid TCKN and missing required person fields', () => {
    const result = validateBillingProfileInput({ ...validIndividual, nationalId: '10000000147', fullName: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fieldErrors.nationalId).toBe('invalid')
      expect(result.fieldErrors.fullName).toBe('required')
    }
  })

  it('preserves a saved identifier when the form leaves it blank', () => {
    const result = validateBillingProfileInput(
      { ...validIndividual, nationalId: '' },
      { existingNationalId: '10000000146' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.nationalId).toBe('10000000146')
  })

  it('allows the client to leave an on-file identifier masked and unchanged', () => {
    const result = validateBillingProfileInput(
      { ...validIndividual, nationalId: '' },
      { hasSavedNationalId: true },
    )
    expect(result.ok).toBe(true)
  })

  it('requires company name, tax office, and a ten-digit VKN', () => {
    expect(validateBillingProfileInput(validCompany).ok).toBe(true)
    const result = validateBillingProfileInput({ ...validCompany, taxOffice: '', taxNumber: '123' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fieldErrors.taxOffice).toBe('required')
      expect(result.fieldErrors.taxNumber).toBe('invalid')
    }
  })

  it('accepts declaration-based email shapes without lowercasing or requiring a dot', () => {
    for (const invoiceEmail of ['doganboracom@gmail.com', 'yerel@localhost', 'AD+etiket@Türkçe_alan-adı', 'ad.soyad+etiket@ornek.com.tr']) {
      expect(validateBillingProfileInput({ ...validIndividual, invoiceEmail }).ok).toBe(true)
    }
  })

  it('rejects emails with whitespace, missing at-signs or dots, and overlong values', () => {
    for (const invoiceEmail of ['ad soyad@gmail.com', 'adgmail.com', '@ornek', 'ad@', 'a'.repeat(253) + '@a']) {
      const result = validateBillingProfileInput({ ...validIndividual, invoiceEmail })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.fieldErrors.invoiceEmail).toBe('invalid')
    }
  })

  it('maps phone normalization and validation to the phone field', () => {
    const accepted = validateBillingProfileInput({ ...validIndividual, phone: '05424647610' })
    expect(accepted.ok).toBe(true)
    if (accepted.ok) expect(accepted.value.phone).toBe('+905424647610')

    const rejected = validateBillingProfileInput({ ...validIndividual, phone: 'invalid' })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.fieldErrors.phone).toBe('invalid')
  })

  it('keeps address and identity errors on their own fields', () => {
    const result = validateBillingProfileInput({ ...validIndividual, addressLine: '', nationalId: '123' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fieldErrors.addressLine).toBe('required')
      expect(result.fieldErrors.nationalId).toBe('invalid')
      expect(result.fieldErrors.invoiceEmail).toBeUndefined()
    }
  })

  it('only treats profiles with valid type-specific identifiers as complete', () => {
    expect(isBillingProfileComplete(validIndividual)).toBe(true)
    expect(isBillingProfileComplete({ ...validIndividual, nationalId: '' })).toBe(false)
    expect(isBillingProfileComplete(validCompany)).toBe(true)
  })
})

describe('CSV safety', () => {
  it('quotes values and neutralizes spreadsheet formulas', () => {
    expect(escapeCsvCell('=HYPERLINK("https://example.com")')).toBe('"\'=HYPERLINK(""https://example.com"")"')
    expect(escapeCsvCell('Ayşe, Yılmaz')).toBe('"Ayşe, Yılmaz"')
  })

  it('serializes rows with a UTF-8 BOM and CRLF line endings', () => {
    expect(serializeCsv([['name', 'email'], ['A', 'a@example.com']])).toBe('\uFEFF"name","email"\r\n"A","a@example.com"\r\n')
  })
})

describe('billing profile reminders', () => {
  it('does not append a reminder when the profile is complete', () => {
    expect(appendBillingProfileReminder('Payment completed.', false, 'tr')).toBe('Payment completed.')
    const notice = buildCreditNotice({ amount: 2500, firstPeriod: true, billingProfileIncomplete: false })
    expect(notice.body).not.toContain('fatura bilgilerinizi')
  })

  it('adds a localized, direct billing link only for incomplete profiles', () => {
    const turkish = appendBillingProfileReminder('Ödeme başarılı.', true, 'tr')
    const english = appendBillingProfileReminder('Payment successful.', true, 'en')
    expect(turkish).toContain(billingProfileReminderText('tr'))
    expect(turkish).toContain('https://gloval.ai/billing#fatura-bilgileri')
    expect(english).toContain(billingProfileReminderText('en'))
    expect(english).toContain('/billing#fatura-bilgileri')
  })

  it('keeps credit amount parsing intact after appending the note', () => {
    const notice = buildCreditNotice({ amount: 2500, firstPeriod: true, billingProfileIncomplete: true })
    expect(parseCreditNoticeAmount(notice.body)).toBe(2500)
    expect(notice.body).toContain('fatura bilgilerinizi')
  })
})

describe('billing profile save diagnostics', () => {
  it('maps a constraint to exactly one field', () => {
    const message = 'new row for relation "billing_profiles" violates check constraint "billing_profiles_phone_check"'
    expect(parseConstraintName(message)).toBe('billing_profiles_phone_check')
    expect(fieldForConstraint('billing_profiles_phone_check', 'individual')).toBe('phone')
    expect(fieldForConstraint('billing_profiles_invoice_email_check', 'individual')).toBe('invoiceEmail')
    expect(fieldForConstraint('billing_profiles_customer_identity_check', 'individual')).toBe('nationalId')
    expect(fieldForConstraint('billing_profiles_customer_identity_check', 'company')).toBe('taxNumber')
    expect(fieldForConstraint('something_else', 'individual')).toBeNull()
    expect(fieldForConstraint(null, 'individual')).toBeNull()
  })

  it('logs codes and names only, never row data', () => {
    const log = saveFailureLog({
      code: '23514',
      message: 'violates check constraint "billing_profiles_phone_check" Failing row contains (doganboracom@gmail.com)',
    })
    expect(log).toBe('[billing-profile] save_failed code=23514 constraint=billing_profiles_phone_check')
    expect(log).not.toContain('gmail')
    expect(validationFailureLog({ phone: 'invalid', city: 'required' })).toBe('[billing-profile] validation_failed fields=city,phone')
  })

  it('drops unknown server field keys instead of misplacing them', () => {
    const { fieldErrors, hasUnknownKeys } = pickKnownFieldErrors({ invoiceEmail: 'invalid', bogus: 'invalid' })
    expect(fieldErrors).toEqual({ invoiceEmail: 'invalid' })
    expect(hasUnknownKeys).toBe(true)
  })
})
