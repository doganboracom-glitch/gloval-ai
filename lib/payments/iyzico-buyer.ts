import { isValidTurkishNationalId, isValidTurkishTaxNumber } from '@/lib/billing-profile-validation'
import { isPublicIPv4, splitFullName } from '@/lib/platform-buyer-shared'
import { PaymentBuyerError } from './types'

/**
 * TEST-ONLY placeholder buyer values for iyzico's SANDBOX host. They fill a gap
 * only when `isSandbox` is true and the real value is missing/invalid. They are
 * never reachable on the live host: `buildIyzicoBuyerPayload` throws a
 * `PaymentBuyerError` there instead.
 */
export const IYZICO_SANDBOX_TEST_FIXTURES = {
  identityNumber: '74300864791',
  ip: '85.34.78.112',
  gsmNumber: '+905350000000',
  address: 'Sandbox Test Adresi No:1',
  city: 'Istanbul',
} as const

export type IyzicoBuyerInput = {
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  phone?: string
  identityNumber?: string
  address?: string
  district?: string
  city?: string
  country?: string
  ip?: string | null
}

/** Turkish mobile -> iyzico `+90XXXXXXXXXX`; null when it is not a valid 5XXXXXXXXX number. */
export function toGsmNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  let national = digits
  if (national.startsWith('90') && national.length > 10) national = national.slice(2)
  if (national.startsWith('0')) national = national.slice(1)
  national = national.slice(-10)
  if (national.length !== 10 || !national.startsWith('5')) return null
  return `+90${national}`
}

function validIdentity(raw: string | undefined | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 11 && isValidTurkishNationalId(digits)) return digits
  if (digits.length === 10 && isValidTurkishTaxNumber(digits)) return digits
  return null
}

export type IyzicoBuyerPayload = {
  buyer: Record<string, string>
  shippingAddress: Record<string, string>
  billingAddress: Record<string, string>
}

/**
 * Builds the buyer/address blocks of an iyzico Checkout Form request from the
 * real buyer. Live: every field must be real or a `PaymentBuyerError` is
 * thrown and nothing is sent. Sandbox: missing/invalid values fall back to the
 * labelled `IYZICO_SANDBOX_TEST_FIXTURES`.
 */
export function buildIyzicoBuyerPayload(
  input: { orderId: string; customerEmail: string; buyer: IyzicoBuyerInput },
  options: { isSandbox: boolean },
): IyzicoBuyerPayload {
  const { buyer } = input
  const { isSandbox } = options
  const fixtures = IYZICO_SANDBOX_TEST_FIXTURES

  const fullName = (buyer.fullName ?? '').trim()
  const split = splitFullName(fullName)
  const firstName = (buyer.firstName ?? split.firstName).trim()
  const lastName = (buyer.lastName ?? split.lastName).trim()
  if (!firstName || !lastName) throw new PaymentBuyerError('fullName')

  const email = (buyer.email ?? input.customerEmail ?? '').trim()
  if (email.indexOf('@') < 1) throw new PaymentBuyerError('email')

  const gsm = toGsmNumber(buyer.phone) ?? (isSandbox ? fixtures.gsmNumber : null)
  if (!gsm) throw new PaymentBuyerError('phone')

  const identityNumber = validIdentity(buyer.identityNumber) ?? (isSandbox ? fixtures.identityNumber : null)
  if (!identityNumber) throw new PaymentBuyerError('taxId')

  const ip = buyer.ip && isPublicIPv4(buyer.ip) ? buyer.ip : isSandbox ? fixtures.ip : null
  if (!ip) throw new PaymentBuyerError('ip')

  const street = (buyer.address ?? '').trim()
  const district = (buyer.district ?? '').trim()
  const address = street ? (district ? `${street}, ${district}` : street) : isSandbox ? fixtures.address : ''
  if (!address) throw new PaymentBuyerError('address')

  const city = (buyer.city ?? '').trim() || (isSandbox ? fixtures.city : '')
  if (!city) throw new PaymentBuyerError('city')

  const country = !buyer.country || buyer.country.toUpperCase() === 'TR' ? 'Turkey' : buyer.country
  const contactName = `${firstName} ${lastName}`.trim() === fullName || !fullName ? `${firstName} ${lastName}` : fullName

  return {
    buyer: {
      id: input.orderId,
      name: firstName,
      surname: lastName,
      identityNumber,
      email,
      gsmNumber: gsm,
      registrationAddress: address,
      city,
      country,
      ip,
    },
    shippingAddress: { contactName, city, country, address },
    billingAddress: { contactName, city, country, address },
  }
}
