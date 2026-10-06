/**
 * Shared custom-domain model for GLOVAL.
 *
 * This is deliberately ONE domain layer consumed by both products:
 *
 *   Customer -> Paid plan -> Custom domain -> DNS verification -> active
 *                                                 |-- website
 *                                                 |-- corporate email
 *
 * Neither the website system nor the mail system may own its own domain
 * registry. `lib/mail/domain-service.ts` delegates here rather than keeping a
 * parallel list, so "is this domain usable" is answered in exactly one place.
 *
 * Note this lives in `lib/custom-domains/` and NOT `lib/domains/`: `lib/domains.ts`
 * already exists and holds the platform/tenant *routing* helpers (gloval.ai,
 * *.gloval.site). Those are untouched, and a directory of the same name would
 * shadow that module on the `@/lib/domains` specifier.
 *
 * Side-effect free and data-access free so it is safe to import from client
 * components, mirroring the `lib/billing.ts` / `lib/billing-utils.ts` split.
 */

/**
 * Lifecycle of a customer domain.
 *
 * These names intentionally match the existing mail domain vocabulary already
 * shipped in `lib/mail/types.ts` (`pending | verifying | active | failed`)
 * rather than inventing a second dialect; `disabled` is the only addition, for
 * a domain an operator has switched off without deleting.
 *
 *   pending   - added, customer has not published DNS yet
 *   verifying - verification in flight
 *   active    - DNS verified and serving (this is the "verified" state)
 *   failed    - verification attempted and did not pass
 *   disabled  - retained but switched off
 */
export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'disabled'

/** Which product a DNS record exists for, so the UI can group them. */
export type DomainPurpose = 'website' | 'email' | 'verification'

/** Real DNS record types. SPF/DKIM/DMARC are TXT records, not their own type. */
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX'

export type DnsRecord = {
  type: DnsRecordType
  /** Host/name portion; `@` for the apex. */
  host: string
  value: string
  /** MX only. */
  priority?: number
  /**
   * Optional role label for records whose type does not convey intent, e.g. a
   * TXT record labelled `SPF`, `DKIM` or `DMARC`. Lets the email section render
   * those without adding fake DNS record types.
   */
  label?: 'SPF' | 'DKIM' | 'DMARC'
  purpose: DomainPurpose
  verified: boolean
  /**
   * Where the value came from. `vercel` = returned by the Vercel Domains API
   * (add/verify response or the domain config endpoint); `gloval` = generated
   * by us (the per-domain ownership token). Absent on legacy and email records.
   */
  source?: 'vercel' | 'gloval'
  /**
   * True when the value is a stand-in produced without a real DNS/registrar
   * integration. The UI MUST surface this rather than presenting the record as
   * something the customer can usefully publish today.
   */
  placeholder: boolean
}

/**
 * The three post-ownership stages are tracked separately on purpose. `status`
 * only says the customer proved they own the name (TXT); it must never be read
 * as "the site is reachable".
 *
 *   dns    - the A/CNAME records actually point at the platform
 *   vercel - the hostname is attached to the Vercel project (and Vercel has
 *            verified it, or is waiting for an extra ownership TXT)
 *   ssl    - HTTPS answers with a valid certificate
 */
export type DnsStage = 'pending' | 'configured' | 'misconfigured'
export type VercelStage = 'not_configured' | 'pending' | 'needs_verification' | 'connected' | 'error'
export type SslStage = 'pending' | 'ready' | 'error'

export type DomainConnection = {
  dns: DnsStage
  vercel: VercelStage
  ssl: SslStage
  lastCheckedAt: string | null
  lastError: string | null
  /**
   * Row predates connection tracking (its ssl_status column is NULL). Such a
   * domain keeps serving exactly as before until its first connection check,
   * so existing site bindings are not broken by the migration.
   */
  legacy: boolean
}

export const EMPTY_CONNECTION: DomainConnection = {
  dns: 'pending',
  vercel: 'not_configured',
  ssl: 'pending',
  lastCheckedAt: null,
  lastError: null,
  legacy: false,
}

/**
 * Where the domain's registration lives.
 *  - `registrar`: bought or transferred in through GLOVAL AI; the registration
 *    exists at the registrar and must never be deleted by removing a list row.
 *  - `external`: connected by the customer from elsewhere; GLOVAL AI only holds
 *    the connection and has no registrar control over it.
 */
export type DomainSource = 'registrar' | 'external'

/** Derived from the stored `provider` column, so no migration is required. */
export function domainSourceFromProvider(provider: string | null | undefined): DomainSource {
  return provider === 'domainnameapi' ? 'registrar' : 'external'
}

/**
 * The single rule for "may this row be attached to the hosting project?".
 *
 * A domain bought through GLOVAL starts registered + unbound and is attached
 * ONLY after its owner explicitly picks a project ("Projeye senkronize et",
 * which writes `websiteProjectId`). Purchase finalization, ownership
 * verification, detail-page loads and the reconciliation cron all funnel
 * through `refreshConnection`, which consults this before any hosting call.
 * External (customer-connected) domains are always created bound to a project,
 * so they are unaffected.
 */
export function isHostingAttachAllowed(domain: Pick<CustomDomain, 'source' | 'websiteProjectId' | 'status'>): boolean {
  if (domain.status === 'disabled') return false
  if (domain.source === 'registrar' && !domain.websiteProjectId) return false
  return true
}

/**
 * May a caller bind a project to this domain through the generic bind action?
 * A domain bought through GLOVAL can only be bound by `syncMyDomainToProject`,
 * which binds and attaches in one step and rolls both back on failure. A bare
 * bind would set `websiteProjectId` without that attach/rollback, after which
 * the reconciliation cron would attach it. Unbinding (null) never attaches and
 * stays allowed.
 */
export function isDirectProjectBindAllowed(domain: Pick<CustomDomain, 'source'>, projectId: string | null): boolean {
  return projectId === null || domain.source !== 'registrar'
}

export type CustomDomain = {
  id: string
  /** Owner. Every customer-facing read is scoped by this. */
  userId: string
  /** Normalized registrable domain, e.g. `firma.com` (never a URL). */
  domain: string
  status: DomainStatus
  /** Exactly one domain per user may be primary. */
  isPrimary: boolean
  dns: DnsRecord[]
  /**
   * Set once a published website is bound to this domain. Kept as a nullable id
   * so the website system can adopt it later without a model change; nothing
   * writes it yet.
   */
  websiteProjectId: string | null
  /** Whether corporate mail has been provisioned on this domain. */
  emailEnabled: boolean
  createdAt: string
  verifiedAt: string | null
  connection: DomainConnection
  /**
   * True when the record came from the mock provider, i.e. its `active` state
   * was simulated and no DNS lookup ever happened. Surfaced in the UI so a
   * simulated verification is never mistaken for a real one.
   */
  mock: boolean
  source: DomainSource
  /** Provider-reported expiry (UTC instant), when the registrar named its zone. */
  expiresAt: string | null
}

export type AddDomainInput = {
  userId: string
  /** Must already be normalized and validated by the caller. */
  domain: string
  /**
   * Set only by the registrar purchase flow. The platform registered the domain
   * on the customer's behalf, so ownership is already proven and it is created
   * `active`. Combined with `orderId` the insert is idempotent per order.
   */
  registered?: { orderId: string; expiresAt: string | null }
  /**
   * GLOVAL project the domain is created for. The project is chosen BEFORE the
   * domain, so new rows are bound from the start. Serving is still gated by
   * `status === 'active'` (ownership) plus the connection stages.
   */
  websiteProjectId?: string | null
}

export type DomainErrorCode =
  | 'DOMAIN_EXISTS'
  /** No server-side renewal price could be resolved (provider price or FX/VAT missing). */
  | 'PRICING_UNAVAILABLE'
  /** An unfinished renewal already exists for this domain. */
  | 'RENEWAL_IN_PROGRESS'
  | 'INVALID_DOMAIN'
  | 'DOMAIN_LIMIT_REACHED'
  | 'RESERVED_DOMAIN'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'NOT_ENTITLED'
  /** Binding a website requires the domain to already be `active` (verified). */
  | 'DOMAIN_NOT_VERIFIED'
  /** Binding a website requires the target project to be published (have a slug). */
  | 'PROJECT_NOT_PUBLISHED'
  /** No real DNS verification exists yet; a customer domain cannot be marked verified. */
  | 'DNS_VERIFICATION_UNAVAILABLE'
  /** A DNS/hosting lookup could not complete (timeout, outage). Safe to retry; nothing was changed. */
  | 'TEMPORARY_FAILURE'
  /** Hosting provider refused to detach the hostname. The domain row is kept so the delete can be retried. */
  | 'VERCEL_DETACH_FAILED'
  /** Connecting a domain requires choosing one of the caller's projects first. */
  | 'PROJECT_REQUIRED'
  /** The domain is already bound to another project of the caller; it is never moved automatically. */
  | 'DOMAIN_BOUND_TO_OTHER_PROJECT'
  /** The registration lives at the registrar; it can be disconnected from a project but not deleted from here. */
  | 'REGISTRAR_OWNED'
  /** The domain is not managed through the registrar (external domains have no registrar controls). */
  | 'NOT_REGISTRAR_MANAGED'
  /** Registrar integration missing, or not safe to use in this environment. */
  | 'REGISTRAR_UNAVAILABLE'
  /** Rejected before any provider call (bad nameserver / contact field / missing confirmation). */
  | 'INVALID_INPUT'
  /** The provider refused the change. */
  | 'PROVIDER_REFUSED'
  /** A change was sent but could not be confirmed. Re-read the state; never retry blindly. */
  | 'OUTCOME_UNKNOWN'
  /** The registrar does not support (or has not been verified to support) this change. Nothing was sent. */
  | 'FEATURE_UNSUPPORTED'
  /** A purchased domain could not be attached to the chosen project (hosting attach failed). Nothing was changed. */
  | 'SYNC_FAILED'
  /** A purchased domain can only be bound to a project through the "sync to project" flow. */
  | 'USE_PROJECT_SYNC'
  /** Unclassified server failure. Deliberately distinct from NOT_FOUND. */
  | 'UNEXPECTED_ERROR'

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode) {
    super(code)
    this.name = 'DomainError'
  }
}

/** Discriminated result so client components never handle a thrown error. */
export type DomainResult<T> = { ok: true; data: T } | { ok: false; error: DomainErrorCode }

/**
 * Provider seam. A real integration is added by implementing this once and
 * registering it in `provider.ts`; no route, action or component changes.
 * Planned implementations: `VercelDomainProvider`, `CloudflareDomainProvider`.
 */
export interface DomainProvider {
  readonly id: string
  /** True when verification actually performs DNS lookups. */
  readonly verifiesForReal: boolean

  /** Every matching row. Implementations must not silently cap the result. */
  listDomains(userId?: string): Promise<CustomDomain[]>
  /** One page of a user's inventory plus the real total, in a stable order. */
  listDomainsPage(userId: string, request: { page: number; pageSize: number }): Promise<{ items: CustomDomain[]; total: number }>
  getDomain(domainId: string): Promise<CustomDomain | null>
  /** Single indexed lookup of an `active` domain by hostname (middleware hot path). */
  findActiveByHost(host: string): Promise<CustomDomain | null>
  /** Any active claim on the hostname, regardless of owner or bound project. */
  findActiveByHostname(domain: string): Promise<CustomDomain | null>
  addDomain(input: AddDomainInput): Promise<CustomDomain>
  /**
   * Attaches the hostname to the Vercel project and stores the DNS records and
   * challenges Vercel returns. Works before ownership is proven; never throws
   * for provider failures (they are recorded in `connection.lastError`).
   */
  syncConnection(domainId: string): Promise<CustomDomain>
  removeDomain(domainId: string): Promise<void>
  /**
   * External domains only. Moves a `pending` domain to `verifying` and makes
   * sure the ownership TXT exists, REUSING the stored verification token (a new
   * one is issued only when none exists). Any other status is returned as-is,
   * so calling it twice is harmless. It never touches the customer's DNS.
   */
  startVerification(domainId: string): Promise<CustomDomain>
  verifyDomain(domainId: string): Promise<CustomDomain>
  setPrimary(userId: string, domainId: string): Promise<CustomDomain[]>
  /** Binds (or unbinds, with `projectId: null`) the website this domain serves. */
  setWebsiteProject(domainId: string, projectId: string | null): Promise<CustomDomain>
  /**
   * Persists the `verified` flag of email-purpose records only (matched by
   * type, host and value). Ownership, website records and `status` are never
   * touched, so the email DNS check stays independent of domain verification.
   */
  saveEmailDnsVerification?(domainId: string, checked: DnsRecord[]): Promise<CustomDomain>
}

export const emailRecordKey = (r: Pick<DnsRecord, 'type' | 'host' | 'value'>) => `${r.type}|${r.host}|${r.value}`

/** A domain is usable by website/email only once fully verified. */
export function isDomainUsable(domain: CustomDomain): boolean {
  return domain.status === 'active'
}

/**
 * True only when the site can really be served on this hostname: ownership
 * verified AND (grandfathered pre-tracking row, OR DNS, Vercel and SSL are all
 * ready). Ownership alone never makes a domain live.
 */
export function isDomainLive(domain: CustomDomain): boolean {
  if (domain.status !== 'active') return false
  const c = domain.connection
  if (c.legacy) return true
  return c.dns === 'configured' && c.vercel === 'connected' && c.ssl === 'ready'
}
