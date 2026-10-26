import { validateBillingProfileInput } from '@/lib/billing-profile-validation'
import type { BillingProfileFieldErrors } from '@/lib/billing-profile-types'

/**
 * The real buyer sent to the PSP for the platform's own billing (plans,
 * add-ons, credit packs, domains). Always derived from the saved billing
 * profile, never from client-supplied fields and never from placeholders.
 */
export type PlatformBuyer = {
  firstName: string
  lastName: string
  fullName: string
  email: string
  /** `+90XXXXXXXXXX` */
  phone: string
  /** Valid TCKN (11 digits) or VKN (10 digits). */
  identityNumber: string
  address: string
  district: string
  city: string
  country: string
  /** Public IPv4 of the buyer's request, or null when none could be found. */
  ip: string | null
}

type HeaderReader = { get(name: string): string | null }

/** True for a routable, public IPv4 address (not private, loopback, link-local, CGNAT, documentation or reserved). */
export function isPublicIPv4(raw: string | null | undefined): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((raw ?? '').trim())
  if (!m) return false
  const [a, b, c] = m.slice(1).map(Number)
  if (m.slice(1).map(Number).some((n) => n > 255)) return false
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function normalizeCandidate(raw: string): string {
  const value = raw.trim()
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value)
  if (mapped) return mapped[1]
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value)
  return withPort ? withPort[1] : value
}

/**
 * Real client IP from the platform's request headers. Returns the first PUBLIC
 * IPv4 found, checking the platform header first, then `x-forwarded-for`
 * (left to right) and `x-real-ip`. Returns null when none qualifies: callers
 * must refuse to start a live payment instead of substituting a sample IP.
 */
export function extractPublicClientIp(headers: HeaderReader): string | null {
  const sources = [
    headers.get('x-vercel-forwarded-for'),
    headers.get('x-forwarded-for'),
    headers.get('x-real-ip'),
  ]
  for (const source of sources) {
    if (!source) continue
    for (const part of source.split(',')) {
      const candidate = normalizeCandidate(part)
      if (isPublicIPv4(candidate)) return candidate
    }
  }
  return null
}

const TR_MOBILE = /^\+905\d{9}$/

/** Splits a display name into the first/last name pair PSPs require. */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: parts[0] ?? '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

export type PlatformBuyerResult =
  | { ok: true; buyer: PlatformBuyer }
  | { ok: false; fieldErrors: BillingProfileFieldErrors }

/**
 * Payment-grade check of an invoice profile: the profile rules (official TCKN
 * algorithm, 10-digit VKN, name/title, province/district/address, e-mail)
 * plus a Turkish mobile number in `+90 5xx` form. On success returns the
 * buyer to hand to the PSP.
 */
export function buildPlatformBuyer(
  form: unknown,
  ip: string | null,
  existing: Parameters<typeof validateBillingProfileInput>[1] = {},
): PlatformBuyerResult {
  const validation = validateBillingProfileInput(form, existing)
  if (!validation.ok) return { ok: false, fieldErrors: validation.fieldErrors }
  const v = validation.value
  const fieldErrors: BillingProfileFieldErrors = {}
  if (v.country === 'TR' && !TR_MOBILE.test(v.phone)) fieldErrors.phone = 'invalid'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  const company = v.customerType === 'company'
  const displayName = company ? v.fullName || v.companyTitle : v.fullName
  const { firstName, lastName } = splitFullName(displayName)
  return {
    ok: true,
    buyer: {
      firstName,
      lastName,
      fullName: displayName,
      email: v.invoiceEmail,
      phone: v.phone,
      identityNumber: company ? v.taxNumber : v.nationalId,
      address: v.addressLine,
      district: v.district,
      city: v.city,
      country: v.country,
      ip,
    },
  }
}
