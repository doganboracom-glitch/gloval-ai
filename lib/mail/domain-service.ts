import { getMailProvider } from './provider'
import { listDomainsForUser } from '@/lib/custom-domains/service'
import { isDomainUsable, type CustomDomain, type DnsRecord } from '@/lib/custom-domains/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyCurrentPlan, getMySubscription } from '@/lib/billing'
import { getMailQuota } from './access'
import type { MailDomain, MailDomainStatus } from './types'

/**
 * Bridge between the shared custom-domain layer and the mail module.
 *
 * Corporate mail deliberately does NOT keep its own list of which domains a
 * customer owns. `lib/custom-domains` is the single registry
 * (Customer -> paid plan -> custom domain -> DNS verification -> website + email),
 * and this file only translates it into the mail module's vocabulary.
 *
 * The mail provider still has its own domain *inventory* — what the mail server
 * has been told to accept mail for — which is a different question from what the
 * customer has claimed. `ensureDomain` reconciles the two: a verified custom
 * domain is provisioned on the provider so mailboxes can be created on it.
 */

/**
 * Custom domain statuses map onto the mail vocabulary 1:1 except `disabled`,
 * which mail has no concept of and which must not read as "working".
 */
function toMailStatus(status: CustomDomain['status']): MailDomainStatus {
  return status === 'disabled' ? 'failed' : status
}

function toMailDomain(domain: CustomDomain): MailDomain {
  return {
    id: domain.id,
    userId: domain.userId,
    domain: domain.domain,
    status: toMailStatus(domain.status),
    // Only the mail-relevant records; website/verification records belong to the
    // domains screen, not the email screen.
    dns: domain.dns
      .filter((record) => record.purpose === 'email')
      .map((record) => ({
        type: record.type as MailDomain['dns'][number]['type'],
        host: record.host,
        value: record.value,
        priority: record.priority,
        verified: record.verified,
      })),
    createdAt: domain.createdAt,
  }
}

/**
 * The caller's mail-capable domains: their verified custom domains, provisioned
 * on the mail provider so mailbox operations resolve.
 *
 * Unverified domains are excluded on purpose — mail cannot work before DNS is in
 * place, and returning one would let the UI offer mailbox creation that the
 * provider would then reject.
 */
export async function getMyMailDomains(userId: string): Promise<MailDomain[]> {
  const usable = (await listDomainsForUser(userId)).filter(isDomainUsable)
  if (usable.length === 0) return []

  const provider = getMailProvider()

  // Provisioning on the mail server costs real resources, so it only happens
  // for customers whose plan actually includes mail. Everyone else just sees
  // their domain list (the page then shows the "upgrade" state).
  const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
  const entitled = getMailQuota(plan, subscription).allowed
  if (!entitled || !provider.ensureDomain) return usable.map(toMailDomain)

  const provisioned = await Promise.all(
    usable.map(async (domain) => {
      await provider.ensureDomain!(toMailDomain(domain))
      return issueEmailDns(domain)
    }),
  )
  return provisioned.map(toMailDomain)
}

/**
 * Replace the stand-in email records with the real ones from the mail server
 * and persist them on the domain, so the domain screen shows exactly what the
 * customer must publish. Idempotent: a no-op once real records are stored.
 * Providers without real DNS data (the mock) leave the placeholders alone.
 */
async function issueEmailDns(domain: CustomDomain): Promise<CustomDomain> {
  const provider = getMailProvider()
  if (!provider.dnsRecords) return domain

  const current = domain.dns.filter((record) => record.purpose === 'email')
  if (current.length > 0 && current.every((record) => !record.placeholder)) return domain

  const specs = await provider.dnsRecords(domain.domain)
  if (specs.length === 0) return domain

  const issued: DnsRecord[] = specs.map((spec) => ({
    type: spec.type,
    host: spec.host,
    value: spec.value,
    priority: spec.priority,
    label: spec.label,
    purpose: 'email',
    verified: false,
    source: 'gloval',
    placeholder: false,
  }))
  const dns = [...domain.dns.filter((record) => record.purpose !== 'email'), ...issued]

  const { error } = await createAdminClient().from('custom_domains').update({ dns }).eq('id', domain.id)
  if (error) throw error
  return { ...domain, dns }
}

/**
 * Lightweight domain state for the Email page's gating copy: it needs to
 * distinguish "no domain at all" from "domain connected but not verified yet",
 * which `getMyMailDomains` (verified only) cannot express.
 */
export type MailDomainGate =
  | { state: 'none' }
  | { state: 'unverified'; domainId: string; domain: string; status: CustomDomain['status'] }
  | { state: 'ready'; domainId: string; domain: string }

export async function getMyMailDomainGate(userId: string): Promise<MailDomainGate> {
  const domains = await listDomainsForUser(userId)
  if (domains.length === 0) return { state: 'none' }

  const usable = domains.find(isDomainUsable)
  if (usable) return { state: 'ready', domainId: usable.id, domain: usable.domain }

  // Primary first ordering means this is the domain the customer cares about.
  const pending = domains[0]
  return {
    state: 'unverified',
    domainId: pending.id,
    domain: pending.domain,
    status: pending.status,
  }
}

/**
 * Admin-facing: every domain the mail provider itself knows about.
 *
 * Intentionally the provider's inventory rather than the custom-domain registry,
 * because the admin mail screens report on the state of the mail system (its
 * mailboxes, aliases and delivery logs), which includes GLOVAL's own
 * platform domain and any domain configured directly on the server.
 */
export async function listAllMailDomains(): Promise<MailDomain[]> {
  return getMailProvider().listDomains()
}
