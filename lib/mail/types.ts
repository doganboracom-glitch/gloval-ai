/**
 * Provider-agnostic corporate mail domain model.
 *
 * This module is intentionally free of side effects and data access so it can
 * be imported from both server actions and client components (mirroring the
 * split between `lib/billing.ts` and `lib/billing-utils.ts`).
 *
 * A real provider (Mailcow, Zoho, Google Workspace, ...) is added by writing a
 * single adapter that satisfies `MailProvider` and registering it in
 * `lib/mail/index.ts`. No route or UI change is required.
 */

export type MailDomainStatus = 'pending' | 'verifying' | 'active' | 'failed'
export type MailboxStatus = 'active' | 'suspended'
export type MailLogStatus = 'delivered' | 'bounced' | 'deferred' | 'rejected'

/** A single DNS record the customer must publish for mail to work. */
export type DnsRecord = {
  type: 'MX' | 'TXT' | 'CNAME'
  /** Host/name portion, `@` for the domain apex. */
  host: string
  value: string
  /** Only meaningful for MX records. */
  priority?: number
  verified: boolean
}

export type MailDomain = {
  id: string
  /** Owner of the domain. Every customer-facing read is scoped by this. */
  userId: string
  domain: string
  status: MailDomainStatus
  dns: DnsRecord[]
  createdAt: string
}

export type Mailbox = {
  id: string
  domainId: string
  /** Portion before the `@`. */
  localPart: string
  /** Full address, denormalized for display and log correlation. */
  address: string
  displayName: string
  quotaMb: number
  usedMb: number
  status: MailboxStatus
  createdAt: string
}

export type MailAlias = {
  id: string
  domainId: string
  address: string
  /** One alias may fan out to several real mailboxes. */
  destinations: string[]
  createdAt: string
}

export type MailLogEntry = {
  id: string
  at: string
  from: string
  to: string
  subject: string
  status: MailLogStatus
  /** Provider diagnostic, e.g. an SMTP rejection reason. */
  detail?: string
}

export type CreateMailboxInput = {
  domainId: string
  localPart: string
  displayName: string
  quotaMb: number
}

export type UpdateMailboxInput = {
  displayName?: string
  quotaMb?: number
  status?: MailboxStatus
}

export type CreateAliasInput = {
  domainId: string
  localPart: string
  destinations: string[]
}

export type MailLogFilter = {
  domainId?: string
  status?: MailLogStatus
  /** Case-insensitive match across from/to/subject. */
  search?: string
  limit?: number
}

/**
 * Error codes a provider may reject with. Using a typed code (rather than a
 * bare string message) lets the UI localize failures instead of leaking
 * provider-specific English text to the user.
 */
export type MailErrorCode =
  | 'MAILBOX_EXISTS'
  | 'ALIAS_EXISTS'
  | 'QUOTA_EXCEEDED'
  | 'MAILBOX_LIMIT_REACHED'
  | 'INVALID_ADDRESS'
  | 'INVALID_DESTINATION'
  | 'DOMAIN_NOT_ACTIVE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'

export class MailError extends Error {
  constructor(public readonly code: MailErrorCode) {
    super(code)
    this.name = 'MailError'
  }
}

/** Discriminated result used by server actions so clients never see a throw. */
export type MailResult<T> = { ok: true; data: T } | { ok: false; error: MailErrorCode }

export interface MailProvider {
  readonly id: string

  listDomains(userId?: string): Promise<MailDomain[]>
  getDomain(domainId: string): Promise<MailDomain | null>
  verifyDomain(domainId: string): Promise<MailDomain>

  /**
   * Provision a domain that the customer has connected and verified through the
   * shared custom-domain layer (`lib/custom-domains`), so mailboxes can be
   * created on it.
   *
   * This is the seam that keeps mail from owning a second domain registry:
   * `lib/custom-domains` decides *which domains a customer has*, and the mail
   * provider only decides *what mail exists on them*. A real adapter maps this
   * onto "add domain to the mail server"; the mock adapter records it in memory.
   *
   * Optional so an adapter whose domains are configured entirely out of band
   * (a fixed Google Workspace tenant, say) can omit it.
   */
  ensureDomain?(domain: MailDomain): Promise<MailDomain>

  listMailboxes(domainId: string): Promise<Mailbox[]>
  createMailbox(input: CreateMailboxInput): Promise<Mailbox>
  updateMailbox(id: string, input: UpdateMailboxInput): Promise<Mailbox>
  deleteMailbox(id: string): Promise<void>
  resetPassword(id: string): Promise<{ tempPassword: string }>

  listAliases(domainId: string): Promise<MailAlias[]>
  createAlias(input: CreateAliasInput): Promise<MailAlias>
  deleteAlias(id: string): Promise<void>

  listLogs(filter: MailLogFilter): Promise<MailLogEntry[]>

  /** Where the end user reads this mailbox in a browser. */
  webmailUrl(address: string): string
}

/** Valid local part: RFC-pragmatic subset that real providers accept. */
export const LOCAL_PART_RE = /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/

export function isValidLocalPart(value: string): boolean {
  return LOCAL_PART_RE.test(value) && !value.includes('..')
}
