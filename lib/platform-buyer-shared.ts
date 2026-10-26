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
type IPv4Octets = [number, number, number, number]
type IPv6Words = [number, number, number, number, number, number, number, number]

const CLIENT_IP_HEADER_PRIORITY = [
  'cf-connecting-ip',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'x-forwarded-for',
] as const

export type ClientIpHeader = (typeof CLIENT_IP_HEADER_PRIORITY)[number]
export type ResolvedPublicClientIp = { ip: string; header: ClientIpHeader }

function parseIPv4(raw: string): IPv4Octets | null {
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(raw.trim())
  if (!match) return null
  const octets: IPv4Octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]
  return octets.some((octet) => octet > 255) ? null : octets
}

/** True for a routable, public IPv4 address (not private, loopback, link-local, CGNAT, documentation or reserved). */
export function isPublicIPv4(raw: string | null | undefined): boolean {
  const octets = parseIPv4(raw ?? '')
  if (!octets) return false
  const [a, b, c] = octets
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function ipv4FromMappedIPv6(raw: string): string | null {
  let value = raw.toLowerCase()
  if (value.includes('%')) return null

  const dottedTail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (dottedTail) {
    const octets = parseIPv4(dottedTail[1])
    if (!octets || value[dottedTail.index - 1] !== ':') return null
    const highWord = ((octets[0] << 8) | octets[1]).toString(16)
    const lowWord = ((octets[2] << 8) | octets[3]).toString(16)
    value = `${value.slice(0, dottedTail.index)}${highWord}:${lowWord}`
  }

  const compression = value.indexOf('::')
  if (compression !== value.lastIndexOf('::')) return null
  const leftValue = compression === -1 ? value : value.slice(0, compression)
  const rightValue = compression === -1 ? '' : value.slice(compression + 2)
  const left = leftValue ? leftValue.split(':') : []
  const right = rightValue ? rightValue.split(':') : []
  const explicitWords = [...left, ...right]
  if (explicitWords.some((word) => !/^[\da-f]{1,4}$/.test(word))) return null

  let words: string[]
  if (compression === -1) {
    if (explicitWords.length !== 8) return null
    words = explicitWords
  } else {
    const zeroWords = 8 - explicitWords.length
    if (zeroWords < 1) return null
    words = [...left, ...Array.from({ length: zeroWords }, () => '0'), ...right]
  }

  if (words.length !== 8) return null
  const octets = words.map((word) => Number.parseInt(word, 16)) as IPv6Words
  if (octets.slice(0, 5).some((word) => word !== 0) || octets[5] !== 0xffff) return null

  return [octets[6] >> 8, octets[6] & 255, octets[7] >> 8, octets[7] & 255].join('.')
}

function normalizeCandidate(raw: string): string {
  let value = raw.trim()
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) value = bracketed[1]

  const withPort = /^(0|[1-9]\d{0,2})(?:\.(0|[1-9]\d{0,2})){3}:\d+$/.exec(value)
  if (withPort) value = value.slice(0, value.lastIndexOf(':'))

  return ipv4FromMappedIPv6(value) ?? value
}

/**
 * Resolves the first public IPv4 from the trusted request headers in priority
 * order. Each header's comma-separated values are checked left to right;
 * invalid, private and reserved addresses are skipped. Native IPv6 is not
 * passed to the PSP, while IPv4-mapped IPv6 is normalized before validation.
 */
export function resolvePublicClientIp(headers: HeaderReader): ResolvedPublicClientIp | null {
  for (const header of CLIENT_IP_HEADER_PRIORITY) {
    const source = headers.get(header)
    if (!source) continue
    for (const part of source.split(',')) {
      const candidate = normalizeCandidate(part)
      if (isPublicIPv4(candidate)) return { ip: candidate, header }
    }
  }
  return null
}

/** Returns only the resolved IP for callers that do not need its source header. */
export function extractPublicClientIp(headers: HeaderReader): string | null {
  return resolvePublicClientIp(headers)?.ip ?? null
}

/** Masks the final IPv4 octet before a buyer IP is written to application logs. */
export function maskPublicIPv4ForLog(raw: string | null | undefined): string | null {
  const candidate = normalizeCandidate(raw ?? '')
  if (!isPublicIPv4(candidate)) return null
  return `${candidate.slice(0, candidate.lastIndexOf('.'))}.xxx`
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
