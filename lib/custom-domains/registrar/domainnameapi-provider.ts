// Deep import: the `nodejs-dna` facade (`require('nodejs-dna')`) unconditionally
// loads BOTH its REST and SOAP transports at module scope, and the SOAP
// transport unconditionally requires `strong-soap` -> `strong-globalize` ->
// `globalize` -> `cldr`. That chain has no place in this server bundle — our
// reseller credentials are UUID-based, which the SDK itself uses to select
// REST over SOAP — but a static `require('nodejs-dna')` still pulls it in and
// breaks the build (`Module not found: Can't resolve 'cldr'`). `DNARest.js`
// has zero SOAP dependencies of its own, so importing it directly gets the
// SDK's official REST implementation without the dead SOAP branch. See
// `types/nodejs-dna.d.ts` for the ambient module declaration.
import DNARest from 'nodejs-dna/src/DNARest'
import { buildRegistrarDiagnostic, formatRegistrarDiagnostic } from './diagnostics'
import { isLaterRawDate, parseProviderDate, readRawField } from './provider-date'
import {
  RegistrarError,
  type DomainAvailabilityResult,
  type DomainContact,
  type DomainContactSet,
  type DomainListCapable,
  type DomainManageCapable,
  type DomainRegistrarProvider,
  type ManageChange,
  type ManagedDomainDetails,
  type RegisterDomainInput,
  type RegisterDomainResult,
  type DomainTransferCapable,
  type OwnedDomainInfo,
  type OwnedDomainPage,
  type OwnedDomainSummary,
  type TransferCheckResult,
  type TransferPrice,
} from './types'

/**
 * Real DomainNameAPI (domainnameapi.com) adapter, built on the official
 * `nodejs-dna` client rather than hand-rolled HTTP calls, so every request
 * shape and response envelope here matches the library's documented
 * contract (`CheckAvailability`, `RegisterWithContactInfo`) instead of a
 * guessed REST schema.
 *
 * Selected only when `DOMAINNAMEAPI_USERNAME` (a UUID -> REST transport) and
 * `DOMAINNAMEAPI_API_KEY` are both set — see `./provider.ts`.
 */

function splitDomain(domain: string): { label: string; tld: string } | null {
  const parts = domain.toLowerCase().split('.')
  if (parts.length < 2) return null
  const label = parts[0]
  const tld = parts.slice(1).join('.')
  if (!label || !tld) return null
  return { label, tld }
}

type CheckAvailabilityItem = {
  DomainName?: string
  TLD?: string
  Status?: string
  Price?: number | string
  Currency?: string
}

type ErrorEnvelope = { result: 'ERROR'; error?: { Code?: string; Message?: string } }

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return Boolean(value) && typeof value === 'object' && (value as { result?: unknown }).result === 'ERROR'
}

// `nodejs-dna` ships no type declarations (see types/nodejs-dna.d.ts), so its
// REST client is an untyped constructor. This narrows the client down to
// only the two methods this adapter actually calls.
type DomainNameApiClient = {
  lastResponse?: unknown
  lastParsedResponse?: unknown
  CheckAvailability(
    labels: string[],
    tlds: string[],
    period: number,
  ): Promise<CheckAvailabilityItem[] | ErrorEnvelope>
  RegisterWithContactInfo(
    domain: string,
    periodYears: number,
    contacts: Record<string, unknown>,
    nameservers: string[],
    eppLock: boolean,
    privacyLock: boolean,
  ): Promise<{ result: string; data?: Record<string, unknown>; error?: { Code?: string; Message?: string } }>
  GetDetails(domain: string): Promise<{ result?: string; data?: Record<string, unknown> }>
}

type Envelope<T = Record<string, unknown>> = { result?: string; data?: T; error?: { Code?: string; Message?: string } }

type TransferClient = {
  lastResponse?: unknown
  GetList(params?: Record<string, unknown>): Promise<Envelope & { TotalCount?: number }>
  CheckTransfer(domain: string, authCode: string): Promise<Envelope>
  Transfer(domain: string, authCode: string, period: number, contacts?: unknown[]): Promise<Envelope>
  GetDetails(domain: string): Promise<Envelope>
  GetTldList(count?: number): Promise<{ result?: string; data?: { tlds?: TldRow[] } | TldRow[]; error?: { Code?: string } }>
  EnableTheftProtectionLock(domain: string): Promise<Envelope>
  DisableTheftProtectionLock(domain: string): Promise<Envelope>
  ModifyNameServer(domain: string, nameServers: string[]): Promise<Envelope>
  ModifyPrivacyProtectionStatus(domain: string, status: boolean, reason?: string): Promise<Envelope>
  GetContacts(domain: string): Promise<Envelope>
  SaveContacts(domain: string, contacts: Record<string, Record<string, unknown>>): Promise<Envelope>
  Renew(domain: string, period: number): Promise<Envelope>
}

type TldRow = { tld?: string; pricing?: Record<string, Record<string, string>>; currencies?: Record<string, string> }

/** Provider failure carrying only a safe code/message; never request payloads (which hold EPP codes). */
function providerFailure(res: Envelope): RegistrarError {
  const code = res.error?.Code ?? 'UNKNOWN'
  return new RegistrarError('PROVIDER_ERROR', `domainnameapi:${code}`)
}

/**
 * True only when the provider definitively refused the registration, so no
 * domain can exist. Everything else (empty body, timeout, 5xx, 408, unknown
 * code) may have registered the domain and must not be reported as a failure.
 */
function isDefiniteRegisterRejection(code: string | undefined): boolean {
  if (!code) return false
  return code === 'API_350' || /^API_4(?!08)\d\d$/.test(code)
}

  function asBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function handleOf(contacts: unknown, key: string): string | null {
  if (!contacts || typeof contacts !== 'object') return null
  const value = (contacts as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : null
}

const HOSTNAME_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lower-cases, drops a trailing dot and validates each label. Returns null when it is not a hostname. */
function normalizeNameserver(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 253) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  return labels.every((l) => HOSTNAME_LABEL.test(l)) ? host : null
}

/** Nameservers may arrive as strings or `{ name }` objects; the SDK's own mapping stringifies objects. */
function nameserversOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((n) => (typeof n === 'string' ? n : (n as { name?: unknown } | null)?.name))
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
    .map((n) => n.trim().toLowerCase().replace(/\.$/, ''))
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toDomainContact(info: unknown): DomainContact | null {
  if (!info || typeof info !== 'object' || Object.keys(info).length === 0) return null
  const c = info as Record<string, unknown>
  const address = (c.Address ?? {}) as Record<string, unknown>
  const phone = ((c.Phone as Record<string, unknown> | undefined)?.Phone ?? {}) as Record<string, unknown>
  return {
    firstName: str(c.FirstName),
    lastName: str(c.LastName),
    company: str(c.Company),
    email: str(c.EMail),
    addressLine1: str(address.Line1),
    city: str(address.City),
    state: str(address.State),
    country: str(address.Country).toUpperCase(),
    zipCode: str(address.ZipCode),
    phoneCountryCode: str(phone.CountryCode).replace(/^\+/, ''),
    phone: str(phone.Number).replace(/\D/g, ''),
  }
}

function contactMatches(actual: DomainContact | null, wanted: DomainContact): boolean {
  if (!actual) return false
  const norm = (c: DomainContact) =>
    [c.firstName, c.lastName, c.email, c.addressLine1, c.city, c.country, c.zipCode, c.phoneCountryCode, c.phone]
      .map((v) => v.trim().toLowerCase())
      .join('|')
  return norm(actual) === norm(wanted)
}

/** Rejects a contact before any provider call. Returns the normalized contact. */
function validateContact(input: DomainContact): DomainContact {
  const contact: DomainContact = {
    firstName: str(input.firstName),
    lastName: str(input.lastName),
    company: str(input.company),
    email: str(input.email).toLowerCase(),
    addressLine1: str(input.addressLine1),
    city: str(input.city),
    state: str(input.state),
    country: str(input.country).toUpperCase(),
    zipCode: str(input.zipCode),
    phoneCountryCode: str(input.phoneCountryCode).replace(/^\+/, ''),
    phone: str(input.phone).replace(/\D/g, ''),
  }
  const required: Array<[string, string]> = [
    ['firstName', contact.firstName],
    ['lastName', contact.lastName],
    ['addressLine1', contact.addressLine1],
    ['city', contact.city],
    ['zipCode', contact.zipCode],
  ]
  for (const [name, value] of required) {
    if (!value) throw new RegistrarError('INVALID_INPUT', `contact:${name}`)
  }
  if (!EMAIL_SHAPE.test(contact.email)) throw new RegistrarError('INVALID_INPUT', 'contact:email')
  if (!/^[A-Z]{2}$/.test(contact.country)) throw new RegistrarError('INVALID_INPUT', 'contact:country')
  if (!/^\d{1,4}$/.test(contact.phoneCountryCode)) throw new RegistrarError('INVALID_INPUT', 'contact:phoneCountryCode')
  if (!/^\d{4,15}$/.test(contact.phone)) throw new RegistrarError('INVALID_INPUT', 'contact:phone')
  return contact
}

function sdkContactInput(c: DomainContact): Record<string, unknown> {
  return {
    FirstName: c.firstName,
    LastName: c.lastName,
    Company: c.company,
    EMail: c.email,
    AddressLine1: c.addressLine1,
    City: c.city,
    State: c.state,
    Country: c.country,
    ZipCode: c.zipCode,
    Phone: c.phone,
    PhoneCountryCode: c.phoneCountryCode,
  }
}

export class DomainNameApiProvider
  implements DomainRegistrarProvider, DomainTransferCapable, DomainListCapable, DomainManageCapable
{
  readonly id = 'domainnameapi'
  readonly live = true
  private client: DomainNameApiClient
  private secrets: string[]
  private username: string
  private apiKey: string
  private testMode: boolean

  constructor(username: string, apiKey: string, testMode: boolean) {
    this.secrets = [username, apiKey]
    this.username = username
    this.apiKey = apiKey
    this.testMode = testMode
    this.client = this.createClient()
  }

  // `DNARest`'s constructor signature is (resellerId, token, testMode, options) —
  // same REST transport the facade would have selected for a UUID reseller ID,
  // just instantiated directly (see the import comment above for why).
  private createClient(): DomainNameApiClient {
    return new DNARest(this.username, this.apiKey, this.testMode, { telemetry: false }) as unknown as DomainNameApiClient
  }

  async checkAvailability(domain: string, altTlds: string[] = []): Promise<DomainAvailabilityResult[]> {
    const parsed = splitDomain(domain)
    if (!parsed) throw new RegistrarError('INVALID_DOMAIN')

    const tlds = Array.from(new Set([parsed.tld, ...altTlds].map((t) => t.toLowerCase())))

    let res: CheckAvailabilityItem[] | ErrorEnvelope
    try {
      res = await this.client.CheckAvailability([parsed.label], tlds, 1)
    } catch (error) {
      throw new RegistrarError(
        'PROVIDER_ERROR',
        error instanceof Error ? error.message : String(error),
      )
    }

    if (isErrorEnvelope(res)) {
      throw new RegistrarError('PROVIDER_ERROR', res.error?.Message ?? res.error?.Code)
    }
    if (!Array.isArray(res)) {
      throw new RegistrarError('PROVIDER_ERROR', 'unexpected_response_shape')
    }

    return res.map((item): DomainAvailabilityResult => {
      const tld = (item.TLD ?? '').toLowerCase()
      const status: DomainAvailabilityResult['status'] =
        item.Status === 'available' ? 'available' : item.Status === 'notavailable' ? 'unavailable' : 'unknown'
      const priceNum = typeof item.Price === 'string' ? Number.parseFloat(item.Price) : item.Price
      const price =
        typeof priceNum === 'number' && Number.isFinite(priceNum)
          ? {
              registerCents: Math.round(priceNum * 100),
              // CheckAvailability only returns the registration price; the real
              // renewal cost is unverified, so it is never inferred from it.
              renewCents: null,
              currency: item.Currency ?? 'USD',
            }
          : null

      return {
        domain: `${parsed.label}.${tld}`,
        tld,
        status,
        price,
      }
    })
  }

  async registerDomain(input: RegisterDomainInput): Promise<RegisterDomainResult> {
    const { domain, periodYears, contact } = input
    const contactPayload = {
      FirstName: contact.firstName,
      LastName: contact.lastName,
      Company: contact.company || undefined,
      EMail: contact.email,
      AddressLine1: contact.addressLine1,
      City: contact.city,
      // Orders created before the form collected a state fall back to the city.
      State: contact.state?.trim() || contact.city,
      Country: contact.country,
      ZipCode: contact.zipCode,
      Phone: contact.phone,
      PhoneCountryCode: contact.phoneCountryCode,
      Type: 'Contact',
    }

    // The SDK stores the last HTTP response on the client instance, so a client
    // shared across concurrent registrations could hand one request another's
    // error body. A dedicated instance per registration means `lastResponse` /
    // `lastParsedResponse` can only ever come from this request's own HTTP call.
    const client = this.createClient()

    let res: { result: string; data?: Record<string, unknown>; error?: { Code?: string; Message?: string } }
    try {
      res = await client.RegisterWithContactInfo(
        domain,
        periodYears,
        {
          Administrative: contactPayload,
          Billing: contactPayload,
          Technical: contactPayload,
          Registrant: contactPayload,
        },
        [],
        true,
        false,
      )
    } catch (error) {
      const diagnostic = buildRegistrarDiagnostic({
        provider: this.id,
        operation: 'registerDomain',
        providerCode: 'EXCEPTION',
        providerMessage: error instanceof Error ? error.message : String(error),
        contact,
        secrets: this.secrets,
      })
      console.log('[v0] registrar diagnostic', diagnostic)
      throw new RegistrarError('PROVIDER_ERROR', formatRegistrarDiagnostic(diagnostic), diagnostic)
    }

    if (res.result !== 'OK' || !res.data) {
      const code = res.error?.Code
      // The SDK collapses a non-2xx reply into `{ Code: 'API_<status>', Message: 'HTTP <status>' }`
      // and keeps the parsed body only on the client, so read it from this
      // request's own dedicated client (never the shared one).
      const body = client.lastParsedResponse ?? client.lastResponse
      const diagnostic = buildRegistrarDiagnostic({
        provider: this.id,
        operation: 'registerDomain',
        providerCode: code ?? null,
        providerMessage: res.error?.Message ?? null,
        body,
        contact,
        secrets: this.secrets,
      })
      console.log('[v0] registrar diagnostic', diagnostic)

      if (code === 'API_350') {
        throw new RegistrarError('INSUFFICIENT_BALANCE', formatRegistrarDiagnostic(diagnostic), diagnostic)
      }
      if (isDefiniteRegisterRejection(code)) {
        throw new RegistrarError('REGISTRATION_FAILED', formatRegistrarDiagnostic(diagnostic), diagnostic)
      }

      // Empty body, malformed reply, timeout or 5xx: the request may well have
      // registered the domain. Ask the registrar before deciding anything, and
      // if it is still unknown surface PROVIDER_ERROR so the order is held for
      // reconciliation instead of being failed and refunded.
      const confirmed = await this.confirmRegistered(domain)
      if (confirmed) return confirmed
      throw new RegistrarError('PROVIDER_ERROR', formatRegistrarDiagnostic(diagnostic), diagnostic)
    }

    // The registration reply is not authoritative: against the real OTE API it
    // came back with an empty DomainName, lock/privacy reported as "false" and
    // no nameservers, while GetDetails showed the actual state. The domain is
    // already registered and paid for at this point, so a failed read-back must
    // never fail the order; it just falls back to the registration reply.
    let details: Record<string, unknown> | null = null
    try {
      const readBack = await client.GetDetails(domain)
      if (readBack.result === 'OK' && readBack.data) details = readBack.data
    } catch {
      details = null
    }

    return this.buildRegisterResult(domain, client, details ?? res.data, details ?? res.data)
  }

  private buildRegisterResult(
    domain: string,
    client: { lastResponse?: unknown },
    source: Record<string, unknown>,
    named: Record<string, unknown>,
  ): RegisterDomainResult {
    const expiry = parseProviderDate(readRawField(client.lastResponse, 'expirationDate'))
    return {
      providerDomainId: String(named.DomainName || domain),
      expiresAt: expiry.instant,
      expiresAtRaw: expiry.raw,
      raw: source,
    }
  }

  /**
   * Read-only check used after an inconclusive register reply. Returns a result
   * only when the registrar reports this exact domain as Active; any error or
   * mismatch returns null so the caller keeps the outcome "unknown".
   */
  private async confirmRegistered(domain: string): Promise<RegisterDomainResult | null> {
    const client = this.createClient()
    try {
      const res = await client.GetDetails(domain)
      const data = res.result === 'OK' ? res.data : undefined
      if (!data) return null
      const name = String(data.DomainName ?? '').toLowerCase()
      if (name !== domain.toLowerCase()) return null
      if (String(data.Status ?? '').toLowerCase() !== 'active') return null
      return this.buildRegisterResult(domain, client, data, data)
    } catch {
      return null
    }
  }

  private transferClient(): TransferClient {
    return this.createClient() as unknown as TransferClient
  }

  async checkTransferIn(domain: string, authCode: string): Promise<TransferCheckResult> {
    let res: Envelope
    try {
      res = await this.transferClient().CheckTransfer(domain, authCode)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:CHECK_TRANSFER_EXCEPTION')
    }
    const data = (res.data ?? {}) as Record<string, unknown>
    // A negative availability answer comes back as result=ERROR with data attached;
    // that is a valid business answer, not a transport failure.
    if (res.result !== 'OK' && res.error?.Code !== 'TRANSFER_NOT_AVAILABLE' && !('TransferAvailabilityStatus' in data)) {
      throw providerFailure(res)
    }
    const messageKey = String(data.MessageKey ?? '')
    return {
      transferable: Boolean(data.TransferAvailabilityStatus),
      authCodeValid: Boolean(data.AuthCodeIsValid),
      locked: Boolean(data.TransferLock),
      reasonKey: messageKey || null,
    }
  }

  async getTransferPrice(tld: string): Promise<TransferPrice | null> {
    let res
    try {
      res = await this.transferClient().GetTldList(1000)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:TLD_LIST_EXCEPTION')
    }
    const rows: TldRow[] = Array.isArray(res.data) ? res.data : (res.data?.tlds ?? [])
    const row = rows.find((r) => (r.tld ?? '').replace(/^\./, '').toLowerCase() === tld.toLowerCase())
    const raw = row?.pricing?.transfer?.['1']
    const price = raw !== undefined ? Number.parseFloat(raw) : Number.NaN
    // A zero/missing transfer price is "unknown", never "free".
    if (!row || !Number.isFinite(price) || price <= 0) return null
    return { transferCents: Math.round(price * 100), currency: row.currencies?.transfer || 'USD' }
  }

  async startTransferIn(domain: string, authCode: string, periodYears: number): Promise<{ providerStatus: string }> {
    let res: Envelope
    try {
      res = await this.transferClient().Transfer(domain, authCode, periodYears, [])
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:TRANSFER_EXCEPTION')
    }
    if (res.result !== 'OK') throw providerFailure(res)
    return { providerStatus: String((res.data as Record<string, unknown> | undefined)?.Status ?? 'pending') }
  }

  async getOwnedDomainInfo(domain: string): Promise<OwnedDomainInfo | null> {
    const client = this.transferClient()
    let res: Envelope
    try {
      res = await client.GetDetails(domain)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:DETAILS_EXCEPTION')
    }
    if (res.result !== 'OK' || !res.data) return null
    const d = res.data as Record<string, unknown>
    const expiry = parseProviderDate(readRawField(client.lastResponse, 'expirationDate'))
    const start = parseProviderDate(readRawField(client.lastResponse, 'startDate'))
    return {
      locked: d.LockStatus === 'true',
      expiresAt: expiry.instant,
      startedAt: start.instant,
      expiresAtRaw: expiry.raw,
      startedAtRaw: start.raw,
      status: String(d.Status ?? ''),
      hasAuthCode: String(d.AuthCode ?? '').length > 0,
    }
  }

  async listOwnedDomains(options: { skip?: number; take?: number } = {}): Promise<OwnedDomainPage> {
    const client = this.transferClient()
    let res: Envelope & { TotalCount?: number }
    try {
      res = await client.GetList({ MaxResultCount: options.take ?? 200, SkipCount: options.skip ?? 0 })
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:LIST_EXCEPTION')
    }
    if (res.result !== 'OK') throw providerFailure(res)

    // The SDK's list mapping drops contact handles, mis-reads nameservers and
    // formats dates in the process zone, so the real rows come from the raw body.
    const body = client.lastResponse as { items?: unknown; totalCount?: unknown } | null | undefined
    if (!body || !Array.isArray(body.items)) {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:LIST_UNEXPECTED_SHAPE')
    }

    const sdkRows = ((res.data as { Domains?: Array<Record<string, unknown>> } | undefined)?.Domains ?? []) as Array<
      Record<string, unknown>
    >
    const statusByName = new Map(sdkRows.map((r) => [String(r.DomainName ?? '').toLowerCase(), String(r.Status ?? '')]))

    const items: OwnedDomainSummary[] = []
    for (const row of body.items as Array<Record<string, unknown>>) {
      const name = typeof row?.domainName === 'string' ? row.domainName : ''
      if (!name) continue
      const expiry = parseProviderDate(row.expirationDate)
      const ns = Array.isArray(row.nameservers)
        ? (row.nameservers as unknown[])
            .map((n) => (typeof n === 'string' ? n : (n as { name?: unknown } | null)?.name))
            .filter((n): n is string => typeof n === 'string' && n.length > 0)
        : null
      const days = typeof row.remainingDay === 'number' && Number.isFinite(row.remainingDay) ? row.remainingDay : null
      items.push({
        domain: name,
        status: statusByName.get(name.toLowerCase()) ?? '',
        locked: asBool(row.lockStatus),
        privacy: asBool(row.privacyProtectionStatus),
        expiresAtRaw: expiry.raw,
        expiresAt: expiry.instant,
        remainingDays: days,
        nameservers: ns,
        contactHandles:
          row.contacts && typeof row.contacts === 'object'
            ? {
                registrant: handleOf(row.contacts, 'Registrant'),
                admin: handleOf(row.contacts, 'Admin'),
                tech: handleOf(row.contacts, 'Tech'),
                billing: handleOf(row.contacts, 'Billing'),
              }
            : null,
      })
    }

    const total = typeof body.totalCount === 'number' && Number.isFinite(body.totalCount) ? body.totalCount : null
    return { total, items }
  }

  async setTransferLock(domain: string, locked: boolean): Promise<void> {
    const client = this.transferClient()
    let res: Envelope
    try {
      res = locked ? await client.EnableTheftProtectionLock(domain) : await client.DisableTheftProtectionLock(domain)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:LOCK_EXCEPTION')
    }
    if (res.result !== 'OK') throw providerFailure(res)
  }

  async getAuthCode(domain: string): Promise<string | null> {
    let res: Envelope
    try {
      res = await this.transferClient().GetDetails(domain)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:DETAILS_EXCEPTION')
    }
    if (res.result !== 'OK' || !res.data) return null
    const code = String((res.data as Record<string, unknown>).AuthCode ?? '')
    return code || null
  }

  // ---- Account management -------------------------------------------------
  // The SDK reports `OK` for some transport failures, so no mutation is trusted
  // on its envelope alone: each one reads the state back and only then claims
  // success. The raw HTTP body (`lastResponse`) is used for flags and dates
  // because the SDK's normalized form turns a missing flag into "false".

  async getManagedDetails(domain: string): Promise<ManagedDomainDetails | null> {
    const client = this.transferClient()
    let res: Envelope
    try {
      res = await client.GetDetails(domain)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:DETAILS_EXCEPTION')
    }
    if (res.result !== 'OK' || !res.data) return null
    const d = res.data as Record<string, unknown>
    const raw = (client.lastResponse && typeof client.lastResponse === 'object' ? client.lastResponse : {}) as Record<
      string,
      unknown
    >
    const expiry = parseProviderDate(raw.expirationDate)
    const start = parseProviderDate(raw.startDate)
    const days = typeof raw.remainingDay === 'number' && Number.isFinite(raw.remainingDay) ? raw.remainingDay : null
    return {
      domain: String(d.DomainName || domain),
      status: String(d.Status ?? ''),
      locked: asBool(raw.lockStatus),
      privacy: asBool(raw.privacyProtectionStatus),
      nameservers: nameserversOf(raw.nameservers),
      expiresAtRaw: expiry.raw,
      expiresAt: expiry.instant,
      startedAtRaw: start.raw,
      remainingDays: days,
      hasAuthCode: String(d.AuthCode ?? '').length > 0,
    }
  }

  /**
   * Sends one change, then decides from a read-back. Never retries.
   *  - read-back matches            -> success, whatever the envelope said
   *  - envelope OK, read-back differs -> OUTCOME_UNKNOWN (may be propagation lag)
   *  - envelope failed, read-back differs -> the change did not happen: PROVIDER_ERROR
   */
  private async applyAndVerify(
    send: () => Promise<Envelope>,
    confirmed: () => Promise<boolean>,
    failureKey: string,
  ): Promise<void> {
    let res: Envelope | null = null
    try {
      res = await send()
    } catch {
      res = null
    }

    let applied = false
    try {
      applied = await confirmed()
    } catch {
      throw new RegistrarError('OUTCOME_UNKNOWN', `domainnameapi:${failureKey}_UNCONFIRMED`)
    }
    if (applied) return
    if (res && res.result === 'OK') {
      throw new RegistrarError('OUTCOME_UNKNOWN', `domainnameapi:${failureKey}_NOT_CONFIRMED`)
    }
    if (res) throw providerFailure(res)
    throw new RegistrarError('PROVIDER_ERROR', `domainnameapi:${failureKey}_EXCEPTION`)
  }

  private async requireDetails(domain: string): Promise<ManagedDomainDetails> {
    const details = await this.getManagedDetails(domain)
    if (!details) throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:DOMAIN_NOT_FOUND')
    return details
  }

  async setNameservers(domain: string, nameservers: string[]): Promise<ManageChange> {
    const wanted: string[] = []
    for (const entry of nameservers) {
      const host = normalizeNameserver(String(entry ?? ''))
      if (!host) throw new RegistrarError('INVALID_INPUT', 'nameserver:invalid')
      if (!wanted.includes(host)) wanted.push(host)
    }
    if (wanted.length < 2 || wanted.length > 13) throw new RegistrarError('INVALID_INPUT', 'nameserver:count')

    const current = await this.requireDetails(domain)
    if (sameSet(current.nameservers, wanted)) return { changed: false }

    const client = this.transferClient()
    await this.applyAndVerify(
      () => client.ModifyNameServer(domain, wanted),
      async () => sameSet((await this.requireDetails(domain)).nameservers, wanted),
      'NS',
    )
    return { changed: true }
  }

  async setPrivacy(domain: string, enabled: boolean): Promise<ManageChange> {
    const current = await this.requireDetails(domain)
    if (current.privacy === enabled) return { changed: false }

    const client = this.transferClient()
    await this.applyAndVerify(
      () => client.ModifyPrivacyProtectionStatus(domain, enabled),
      async () => (await this.requireDetails(domain)).privacy === enabled,
      'PRIVACY',
    )
    return { changed: true }
  }

  async changeLock(domain: string, locked: boolean): Promise<ManageChange> {
    const current = await this.requireDetails(domain)
    if (current.locked === locked) return { changed: false }

    const client = this.transferClient()
    await this.applyAndVerify(
      () => (locked ? client.EnableTheftProtectionLock(domain) : client.DisableTheftProtectionLock(domain)),
      async () => (await this.requireDetails(domain)).locked === locked,
      'LOCK',
    )
    return { changed: true }
  }

  async getContacts(domain: string): Promise<DomainContactSet> {
    let res: Envelope
    try {
      res = await this.transferClient().GetContacts(domain)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:CONTACTS_EXCEPTION')
    }
    if (res.result !== 'OK') throw providerFailure(res)
    const contacts = ((res.data as { contacts?: Record<string, unknown> } | undefined)?.contacts ?? {}) as Record<
      string,
      unknown
    >
    return {
      registrant: toDomainContact(contacts.Registrant),
      admin: toDomainContact(contacts.Administrative),
      tech: toDomainContact(contacts.Technical),
      billing: toDomainContact(contacts.Billing),
    }
  }

  async updateContacts(domain: string, contact: DomainContact): Promise<ManageChange> {
    const wanted = validateContact(contact)

    const before = await this.getContacts(domain)
    const allMatch = (set: DomainContactSet) =>
      [set.registrant, set.admin, set.tech, set.billing].every((c) => contactMatches(c, wanted))
    if (allMatch(before)) return { changed: false }

    const input = sdkContactInput(wanted)
    const client = this.transferClient()
    await this.applyAndVerify(
      () =>
        client.SaveContacts(domain, {
          Registrant: { ...input },
          Administrative: { ...input },
          Technical: { ...input },
          Billing: { ...input },
        }),
      async () => allMatch(await this.getContacts(domain)),
      'CONTACTS',
    )
    return { changed: true }
  }

  async getRenewalPrice(tld: string, years: number): Promise<{ renewCents: number; currency: string } | null> {
    if (!Number.isInteger(years) || years < 1 || years > 10) return null
    let res
    try {
      res = await this.transferClient().GetTldList(1000)
    } catch {
      throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:TLD_LIST_EXCEPTION')
    }
    const rows: TldRow[] = Array.isArray(res.data) ? res.data : (res.data?.tlds ?? [])
    const row = rows.find((r) => (r.tld ?? '').replace(/^\./, '').toLowerCase() === tld.replace(/^\./, '').toLowerCase())
    const raw = row?.pricing?.renew?.[String(years)]
    const price = raw !== undefined ? Number.parseFloat(raw) : Number.NaN
    // A zero/missing renewal price is "unknown", never "free".
    if (!row || !Number.isFinite(price) || price <= 0) return null
    return { renewCents: Math.round(price * 100), currency: row.currencies?.renew || 'USD' }
  }

  async renewDomain(domain: string, years: number): Promise<{ expiresAtRaw: string | null }> {
    if (!Number.isInteger(years) || years < 1 || years > 10) {
      throw new RegistrarError('INVALID_INPUT', 'renew:years')
    }
    // Baseline before the paid call; both reads use GetDetails so the raw
    // zone-less format is identical and safely comparable.
    const before = await this.getOwnedDomainInfo(domain)
    if (!before) throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:DOMAIN_NOT_FOUND')
    if (before.status !== 'Active') throw new RegistrarError('PROVIDER_ERROR', 'domainnameapi:RENEW_NOT_ACTIVE')

    const client = this.transferClient()
    let res: Envelope | null = null
    try {
      res = await client.Renew(domain, years)
    } catch {
      // Paid call: it may have gone through. Never retried, never reported as failed.
      res = null
    }

    let after: OwnedDomainInfo | null = null
    try {
      after = await this.getOwnedDomainInfo(domain)
    } catch {
      after = null
    }
    if (after && isLaterRawDate(after.expiresAtRaw ?? null, before.expiresAtRaw ?? null)) {
      return { expiresAtRaw: after.expiresAtRaw ?? null }
    }

    if (res && res.result !== 'OK' && isDefiniteRegisterRejection(res.error?.Code) && after) {
      throw providerFailure(res)
    }
    if (!res) throw new RegistrarError('OUTCOME_UNKNOWN', 'domainnameapi:RENEW_EXCEPTION')
    if (res.result !== 'OK') {
      throw new RegistrarError('OUTCOME_UNKNOWN', `domainnameapi:RENEW_${res.error?.Code ?? 'UNKNOWN'}`)
    }
    throw new RegistrarError('OUTCOME_UNKNOWN', 'domainnameapi:RENEW_NOT_CONFIRMED')
  }
}
