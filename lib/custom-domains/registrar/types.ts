/**
 * Domain REGISTRATION (buy-a-new-domain) types.
 *
 * Deliberately separate from `lib/custom-domains/types.ts`'s `DomainProvider`,
 * which is about domains the customer already owns elsewhere (BYO + DNS
 * verification). This module is about searching, pricing, and purchasing a
 * brand-new domain through a real registrar (DomainNameAPI), which is a
 * different lifecycle: availability -> price -> payment -> registration.
 *
 * A successful purchase hands off into the existing `DomainProvider` (the
 * purchased domain is added there, pre-verified) so the website/email binding
 * UI on the domain detail page works unchanged.
 */

export type DomainAvailabilityStatus = 'available' | 'unavailable' | 'unknown'

export type DomainPrice = {
  registerCents: number
  /** Null when the real renewal cost is not verified. Never defaulted to the register price. */
  renewCents: number | null
  /** Provider cost currency (may be foreign). Server-side only; never shown as a sale price. */
  currency: string
}

export type DomainAvailabilityResult = {
  /** Full registrable domain, e.g. "example.com". */
  domain: string
  tld: string
  status: DomainAvailabilityStatus
  /** Null when the provider did not return a usable price for this TLD. */
  price: DomainPrice | null
}

export type RegistrarErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_DOMAIN'
  | 'UNSUPPORTED_TLD'
  | 'PROVIDER_ERROR'
  | 'UNAVAILABLE'
  | 'REGISTRATION_FAILED'
  | 'INSUFFICIENT_BALANCE'
  /** Input rejected before any provider call (bad nameserver, contact field, ...). */
  | 'INVALID_INPUT'
  /** A change was sent but its result could not be confirmed. Never retry blindly; re-read the state. */
  | 'OUTCOME_UNKNOWN'

export class RegistrarError extends Error {
  code: RegistrarErrorCode
  /** Sanitized provider failure details (no PII / secrets). */
  diagnostic?: import('./diagnostics').RegistrarDiagnostic
  constructor(code: RegistrarErrorCode, message?: string, diagnostic?: import('./diagnostics').RegistrarDiagnostic) {
    super(message ?? code)
    this.name = 'RegistrarError'
    this.code = code
    this.diagnostic = diagnostic
  }
}

/** WHOIS registrant contact. Collected from the buyer at purchase time. */
export type RegistrantContact = {
  firstName: string
  lastName: string
  email: string
  /** Local phone digits only, e.g. "5551234567". */
  phone: string
  /** E.164 country calling code without '+', e.g. "90". */
  phoneCountryCode: string
  addressLine1: string
  city: string
  /** State / province. DomainNameAPI rejects registration without it. */
  state?: string
  /** ISO 3166-1 alpha-2, e.g. "TR". */
  country: string
  zipCode: string
  company?: string
}

export type RegisterDomainInput = {
  domain: string
  periodYears: number
  contact: RegistrantContact
}

export type RegisterDomainResult = {
  providerDomainId: string
  /** UTC ISO instant; null unless the provider named the zone (never guessed). */
  expiresAt: string | null
  /** Verbatim provider expiry string (may be zone-less). */
  expiresAtRaw?: string | null
  raw: unknown
}

export type TransferCheckResult = {
  /** Provider says an inbound transfer can be started with this EPP code. */
  transferable: boolean
  authCodeValid: boolean
  /** Registrar-side transfer lock is still on at the losing registrar. */
  locked: boolean
  /** Provider message key only; never the EPP code. */
  reasonKey: string | null
}

export type TransferPrice = {
  /** Provider transfer cost for one year, in provider currency. Server-side only. */
  transferCents: number
  currency: string
}

export type OwnedDomainInfo = {
  /** True only when the provider actually reports a lock flag. */
  locked: boolean
  /** UTC ISO instant; null unless the provider named the zone (never guessed). */
  expiresAt: string | null
  startedAt: string | null
  /** Verbatim provider date strings (may be zone-less, zone not documented). */
  expiresAtRaw?: string | null
  startedAtRaw?: string | null
  /** Raw provider status label, e.g. "Active". */
  status: string
  /** Whether the provider holds an EPP code for this domain (the code itself is not exposed here). */
  hasAuthCode: boolean
}

/**
 * One row of the provider's domain list. The list endpoint is partial, so every
 * field it does not return is `null` (unknown), never a default: no EPP code,
 * and nothing that was not present on the wire. Use `getOwnedDomainInfo` to
 * complete a row.
 */
export type OwnedDomainSummary = {
  domain: string
  status: string
  locked: boolean | null
  privacy: boolean | null
  expiresAtRaw: string | null
  expiresAt: string | null
  remainingDays: number | null
  nameservers: string[] | null
  contactHandles: { registrant: string | null; admin: string | null; tech: string | null; billing: string | null } | null
}

export type OwnedDomainPage = {
  total: number | null
  items: OwnedDomainSummary[]
}

/** Listing of domains held at the provider. Optional like the transfer surface. */
export interface DomainListCapable {
  listOwnedDomains(options?: { skip?: number; take?: number }): Promise<OwnedDomainPage>
}

/** Inbound/outbound transfer operations. Optional: the mock registrar never implements them. */
export interface DomainTransferCapable {
  checkTransferIn(domain: string, authCode: string): Promise<TransferCheckResult>
  getTransferPrice(tld: string): Promise<TransferPrice | null>
  startTransferIn(domain: string, authCode: string, periodYears: number): Promise<{ providerStatus: string }>
  getOwnedDomainInfo(domain: string): Promise<OwnedDomainInfo | null>
  setTransferLock(domain: string, locked: boolean): Promise<void>
  /** Returns the EPP code. Callers must never log or persist it. */
  getAuthCode(domain: string): Promise<string | null>
}

/** Everything the provider reports for one domain. `null` = the provider did not say; never a guessed default. */
export type ManagedDomainDetails = {
  domain: string
  status: string
  locked: boolean | null
  privacy: boolean | null
  nameservers: string[]
  expiresAtRaw: string | null
  expiresAt: string | null
  startedAtRaw: string | null
  remainingDays: number | null
  hasAuthCode: boolean
}

/** One WHOIS contact as the provider stores it. */
export type DomainContact = {
  firstName: string
  lastName: string
  company: string
  email: string
  addressLine1: string
  city: string
  state: string
  /** ISO 3166-1 alpha-2. */
  country: string
  zipCode: string
  /** E.164 calling code without '+'. */
  phoneCountryCode: string
  phone: string
}

export type DomainContactSet = {
  registrant: DomainContact | null
  admin: DomainContact | null
  tech: DomainContact | null
  billing: DomainContact | null
}

/** `changed: false` means the provider already had the requested state and nothing was sent. */
export type ManageChange = { changed: boolean }

/**
 * Account-management operations on a domain we hold at the provider. Every
 * mutation verifies by reading the state back: the SDK reports `OK` for some
 * transport failures, so an envelope is never trusted on its own.
 */
export interface DomainManageCapable {
  getManagedDetails(domain: string): Promise<ManagedDomainDetails | null>
  setNameservers(domain: string, nameservers: string[]): Promise<ManageChange>
  setPrivacy(domain: string, enabled: boolean): Promise<ManageChange>
  changeLock(domain: string, locked: boolean): Promise<ManageChange>
  getContacts(domain: string): Promise<DomainContactSet>
  /** Applies one contact to all four WHOIS roles, as registration does. */
  updateContacts(domain: string, contact: DomainContact): Promise<ManageChange>
  /**
   * Provider renewal cost for exactly `years` years, read from the provider's
   * price list. Null when the provider lists no positive price for that period
   * (never inferred from the registration price). Server-side only.
   */
  getRenewalPrice(tld: string, years: number): Promise<{ renewCents: number; currency: string } | null>
  /**
   * PAID. Not reachable from any user action until a payment flow settles first.
   * Never retried automatically; an unconfirmed result is `OUTCOME_UNKNOWN`.
   */
  renewDomain(domain: string, years: number): Promise<{ expiresAtRaw: string | null }>
}

export function isManageCapable(
  provider: DomainRegistrarProvider | null,
): provider is DomainRegistrarProvider & DomainManageCapable {
  return Boolean(provider) && typeof (provider as unknown as DomainManageCapable).getManagedDetails === 'function'
}

export function isTransferCapable(
  provider: DomainRegistrarProvider | null,
): provider is DomainRegistrarProvider & DomainTransferCapable {
  return Boolean(provider) && typeof (provider as unknown as DomainTransferCapable).checkTransferIn === 'function'
}

export interface DomainRegistrarProvider {
  readonly id: string
  /** False for the mock/dev fallback so callers can label results accordingly. */
  readonly live: boolean
  /**
   * Checks the requested domain plus any additional TLDs for the same label.
   * Throws `RegistrarError` on a provider-level failure; never fabricates a
   * result on error.
   */
  checkAvailability(domain: string, altTlds?: string[]): Promise<DomainAvailabilityResult[]>
  registerDomain(input: RegisterDomainInput): Promise<RegisterDomainResult>
}
