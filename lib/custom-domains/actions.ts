'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getMyCurrentPlan, getMySubscription } from '@/lib/billing'
import { getMailProvider } from '@/lib/mail/provider'
import { getMailQuota } from '@/lib/mail/access'
import { getDomainEntitlement, type DomainEntitlement } from './access'
import { connectDomainToProject } from './connect'
import { dohResolver } from './connection'
import { checkEmailDns, type EmailDnsStatus } from './email-dns'
import { getDomainProvider } from './provider'
import { getVercelClient } from './vercel'
import { isLiveDomainRegistrar } from './registrar/provider'
import { getMyDomainOrders, type MyDomainOrder } from './registrar/actions'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  getOwnedDomain,
  isLiveDomainProvider,
  listAllDomains,
  listDomainsForUser,
  listDomainsPageForUser,
} from './service'
import {
  classifyListError,
  DOMAIN_PAGE_SIZE,
  type DomainPage,
  type DomainPageResult,
} from './pagination'
import {
  DomainError,
  isDirectProjectBindAllowed,
  isDomainUsable,
  type CustomDomain,
  type DomainErrorCode,
  type DomainResult,
} from './types'

/**
 * Custom domain server actions.
 *
 * Every action re-derives the caller from the session and resolves the target
 * domain from that caller's own list, so a client-supplied `domainId` can never
 * reach another tenant's domain. Entitlement and domain limits are enforced
 * HERE; the disabled buttons in the UI are only a usability hint.
 */

export type DomainsOverview = {
  /** First page of the inventory; `domainsPage.total` is the real count. */
  domainsPage: DomainPage
  entitlement: DomainEntitlement
  /** False when the mock provider is active (verification is simulated). */
  live: boolean
  /** False when no real registrar is configured; hides the "buy a domain" entry point. */
  canBuyDomain: boolean
  /** Recent buy-a-domain attempts for the current user, newest first. */
  recentOrders: MyDomainOrder[]
  /** The caller's projects, for the project-first connect wizard. */
  projects: ConnectableProject[]
}

export type ConnectableProject = {
  id: string
  name: string
  slug: string | null
  /** Only published projects can be connected; the rest are listed but disabled. */
  published: boolean
}

export type DomainDetail = {
  domain: CustomDomain
  live: boolean
  website: {
    /** Null until the website publishing flow adopts custom domains. */
    projectId: string | null
    projectName: string | null
  }
  email: {
    /** Whether the plan permits corporate mail at all. */
    entitled: boolean
    mailboxCount: number
    maxMailboxes: number
  }
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new DomainError('UNAUTHENTICATED')
  return user
}

function fail(error: unknown): { ok: false; error: DomainErrorCode } {
  if (error instanceof DomainError) return { ok: false, error: error.code }
  console.log('[v0] domain action failed:', error)
  return { ok: false, error: 'UNEXPECTED_ERROR' }
}

/** Everything the domains list page needs, in one round trip. */
export async function getMyDomainsOverview(): Promise<DomainsOverview> {
  const user = await requireUser()

  const [plan, subscription, domainsPage, recentOrders, projects] = await Promise.all([
    getMyCurrentPlan(),
    getMySubscription(),
    listDomainsPageForUser(user.id, { page: 1, pageSize: DOMAIN_PAGE_SIZE }),
    getMyDomainOrders(),
    listMyConnectableProjects(),
  ])

  return {
    domainsPage,
    entitlement: getDomainEntitlement(plan, subscription),
    live: isLiveDomainProvider(),
    canBuyDomain: isLiveDomainRegistrar(),
    recentOrders,
    projects,
  }
}

const PAGE_RATE_LIMIT = 60
const PAGE_RATE_WINDOW_MS = 60_000

/**
 * One page of the caller's inventory. The owner always comes from the session
 * (never from the arguments), and failures are returned as a classified result
 * so the UI can offer a retry instead of silently showing an empty list.
 */
export async function getMyDomainsPage(page: number, pageSize?: number): Promise<DomainPageResult> {
  let user
  try {
    user = await requireUser()
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, kind: 'unauthenticated' }
    return { ok: false, kind: classifyListError(error) }
  }

  const limit = checkRateLimit(`domains-page:${user.id}`, PAGE_RATE_LIMIT, PAGE_RATE_WINDOW_MS)
  if (!limit.allowed) return { ok: false, kind: 'rate_limited', retryAfterMs: limit.retryAfterMs }

  try {
    return { ok: true, data: await listDomainsPageForUser(user.id, { page, pageSize }) }
  } catch (error) {
    console.log('[v0] domain page read failed:', error instanceof Error ? error.name : 'unknown')
    return { ok: false, kind: classifyListError(error) }
  }
}

/**
 * Detail payload for one domain the caller owns.
 *
 * Returns null (rather than throwing) when the domain is missing or belongs to
 * someone else, so the route can bounce the caller to their own list without
 * disclosing which of the two it was.
 */
export async function getMyDomainDetail(domainId: string): Promise<DomainDetail | null> {
  try {
    const user = await requireUser()
    const domain = await getOwnedDomain(user.id, domainId)

    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    const mailQuota = getMailQuota(plan, subscription)

    // Mailboxes only exist for a verified domain; asking the mail provider about
    // a pending domain would be meaningless.
    const mailboxes =
      domain.status === 'active' && mailQuota.allowed
        ? await getMailProvider().listMailboxes(domain.id)
        : []

    let projectName: string | null = null
    if (domain.websiteProjectId) {
      const { getProject } = await import('@/lib/projects')
      const project = await getProject(domain.websiteProjectId)
      projectName = project?.name ?? null
    }

    return {
      domain,
      live: isLiveDomainProvider(),
      website: {
        projectId: domain.websiteProjectId,
        projectName,
      },
      email: {
        entitled: mailQuota.allowed,
        mailboxCount: mailboxes.length,
        maxMailboxes: mailQuota.maxMailboxes,
      },
    }
  } catch {
    return null
  }
}

/** All of the caller's projects (scoped to the session), publish state included. */
async function listMyConnectableProjects(): Promise<ConnectableProject[]> {
  const { listProjects } = await import('@/lib/projects')
  const projects = await listProjects()
  return projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug ?? null, published: Boolean(p.published && p.slug) }))
}

/** Published sites the caller can bind to a custom domain, for the picker UI. */
export async function listMyPublishableProjects(): Promise<
  { id: string; name: string; slug: string }[]
> {
  // requireUser() is not strictly needed for the RLS scoping (listProjects()
  // already scopes to the caller), but it keeps this action from being
  // usable at all by a signed-out caller.
  await requireUser()
  const { listProjects } = await import('@/lib/projects')
  const projects = await listProjects()
  return projects
    .filter((p) => p.published && p.slug)
    .map((p) => ({ id: p.id, name: p.name, slug: p.slug as string }))
}

/**
 * Binds (or, with `projectId: null`, unbinds) the published website this
 * domain serves. This is what `resolveActiveDomainForHost` reads at request
 * time, so every guard here is load-bearing:
 *  - the domain must belong to the caller (via `getOwnedDomain`)
 *  - the domain must already be `active` (DNS-verified) — a pending domain
 *    binding a site would let a not-yet-proven owner claim traffic for it
 *  - the project must belong to the caller AND be published — a draft has no
 *    slug to route to, and routing to someone else's project is the whole
 *    class of bug this function exists to prevent
 */
export async function bindMyDomainWebsite(
  domainId: string,
  projectId: string | null,
): Promise<DomainResult<CustomDomain>> {
  try {
    const user = await requireUser()
    const domain = await getOwnedDomain(user.id, domainId)

    // Purchased domains are bound only by syncMyDomainToProject (bind + attach +
    // rollback as one unit); a bare bind here must never reach the database.
    if (!isDirectProjectBindAllowed(domain, projectId)) throw new DomainError('USE_PROJECT_SYNC')

    if (projectId) {
      if (!isDomainUsable(domain)) throw new DomainError('DOMAIN_NOT_VERIFIED')

      const { getProject } = await import('@/lib/projects')
      const project = await getProject(projectId)
      if (!project || project.owner_id !== user.id) throw new DomainError('FORBIDDEN')
      if (!project.published || !project.slug) throw new DomainError('PROJECT_NOT_PUBLISHED')
    }

    const updated = await getDomainProvider().setWebsiteProject(domainId, projectId)

    revalidatePath('/dashboard/domains')
    revalidatePath(`/dashboard/domains/${domainId}`)
    return { ok: true, data: updated }
  } catch (error) {
    return fail(error)
  }
}

/** The caller's projects (published state included) for the "sync to project" picker. */
export async function listMyProjectsForSync(): Promise<ConnectableProject[]> {
  await requireUser()
  return listMyConnectableProjects()
}

/**
 * One-click connection for a domain bought through GLOVAL. Ownership is already
 * proven (the platform registered it), so there is no TXT step: the chosen
 * project is bound and the hostname is attached to the hosting project in the
 * same action. If the attach fails the previous binding is restored, so the
 * customer never ends up "connected" to something that is not actually wired.
 * Email DNS records are never touched here.
 */
export async function syncMyDomainToProject(
  domainId: string,
  projectId: string,
): Promise<DomainResult<CustomDomain>> {
  try {
    const user = await requireUser()
    const domain = await getOwnedDomain(user.id, domainId)
    if (domain.source !== 'registrar') throw new DomainError('NOT_REGISTRAR_MANAGED')
    if (!isDomainUsable(domain)) throw new DomainError('DOMAIN_NOT_VERIFIED')

    const { getProject } = await import('@/lib/projects')
    const project = await getProject(projectId)
    if (!project || project.owner_id !== user.id) throw new DomainError('FORBIDDEN')
    if (!project.published || !project.slug) throw new DomainError('PROJECT_NOT_PUBLISHED')

    if (!getVercelClient().configured) {
      console.log('[v0] syncMyDomainToProject: hosting integration is not configured (VERCEL_API_TOKEN / VERCEL_PROJECT_ID)')
      throw new DomainError('SYNC_FAILED')
    }

    const provider = getDomainProvider()
    const previousProjectId = domain.websiteProjectId
    await provider.setWebsiteProject(domainId, projectId)

    let synced: CustomDomain
    try {
      synced = await provider.syncConnection(domainId)
    } catch (error) {
      await provider.setWebsiteProject(domainId, previousProjectId).catch(() => undefined)
      console.log('[v0] syncMyDomainToProject: attach threw', error instanceof Error ? error.message : 'unknown')
      throw new DomainError('SYNC_FAILED')
    }

    const stage = synced.connection.vercel
    if (stage !== 'connected' && stage !== 'pending') {
      console.log('[v0] syncMyDomainToProject: hosting attach not accepted', {
        domain: domain.domain,
        stage,
        lastError: synced.connection.lastError,
      })
      await provider.setWebsiteProject(domainId, previousProjectId).catch(() => undefined)
      // A first-time sync that did not complete must not leave the hostname
      // half-attached to hosting while the domain is back to "unbound".
      if (!previousProjectId) {
        const hosting = getVercelClient()
        for (const host of [`www.${domain.domain}`, domain.domain]) {
          await hosting.removeDomain(host).catch(() => undefined)
        }
      }
      throw new DomainError('SYNC_FAILED')
    }

    revalidatePath('/dashboard/domains')
    revalidatePath(`/dashboard/domains/${domainId}`)
    return { ok: true, data: synced }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Project-first connect: the caller picks one of their published projects, then
 * the domain. The rules (ownership of the project, published state, per-account
 * claim, plan limit, no silent re-binding) live in `connectDomainToProject`; the
 * database partial unique index remains the final race-safe guard for
 * concurrent ACTIVE claims.
 */
export async function addMyDomain(
  raw: string,
  projectId: string | null,
): Promise<DomainResult<CustomDomain>> {
  try {
    const user = await requireUser()

    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    const entitlement = getDomainEntitlement(plan, subscription)
    if (!entitlement.allowed) throw new DomainError('NOT_ENTITLED')

    const { getProject } = await import('@/lib/projects')
    const created = await connectDomainToProject(
      {
        provider: getDomainProvider(),
        loadProject: async (id) => {
          const project = await getProject(id)
          return project
            ? { id: project.id, owner_id: project.owner_id, published: project.published, slug: project.slug }
            : null
        },
      },
      { userId: user.id, projectId, rawDomain: raw, maxDomains: entitlement.maxDomains },
    )

    revalidatePath('/dashboard/domains')
    revalidatePath(`/dashboard/domains/${created.id}`)
    return { ok: true, data: created }
  } catch (error) {
    return fail(error)
  }
}

export async function removeMyDomain(domainId: string): Promise<DomainResult<null>> {
  try {
    const user = await requireUser()
    // Ownership assertion; throws FORBIDDEN when the domain is not the caller's.
    await getOwnedDomain(user.id, domainId)

    await getDomainProvider().removeDomain(domainId)

    revalidatePath('/dashboard/domains')
    revalidatePath('/dashboard/email')
    return { ok: true, data: null }
  } catch (error) {
    return fail(error)
  }
}

/**
 * "Doğrulamayı Başlat" for a domain the customer connected from elsewhere.
 * Owner and domain type are re-derived server-side: the caller must own the row
 * (`getOwnedDomain` throws FORBIDDEN otherwise) and it must be `external`;
 * registrar-bought domains are already verified and never use this flow.
 * The existing verification token is reused, never regenerated.
 */
export async function startMyDomainVerification(domainId: string): Promise<DomainResult<CustomDomain>> {
  try {
    const user = await requireUser()
    const owned = await getOwnedDomain(user.id, domainId)
    if (owned.source !== 'external') throw new DomainError('FORBIDDEN')

    const domain = await getDomainProvider().startVerification(domainId)

    revalidatePath('/dashboard/domains')
    revalidatePath(`/dashboard/domains/${domainId}`)
    return { ok: true, data: domain }
  } catch (error) {
    return fail(error)
  }
}

export async function verifyMyDomain(domainId: string): Promise<DomainResult<CustomDomain>> {
  try {
    const user = await requireUser()
    await getOwnedDomain(user.id, domainId)

    const domain = await getDomainProvider().verifyDomain(domainId)

    revalidatePath('/dashboard/domains')
    revalidatePath(`/dashboard/domains/${domainId}`)
    // A newly verified domain unlocks mailbox creation.
    revalidatePath('/dashboard/email')
    return { ok: true, data: domain }
  } catch (error) {
    return fail(error)
  }
}

const EMAIL_DNS_RATE_LIMIT = 10
const EMAIL_DNS_RATE_WINDOW_MS = 60_000

/**
 * "E-posta DNS kayıtlarını doğrula": checks only the MX/SPF/DKIM/DMARC records.
 * Independent of `verifyMyDomain` — it never changes the domain's status,
 * ownership or website records, and verifying the domain never marks these.
 * The domain must already be verified (mail cannot be used on an unverified one).
 */
export async function verifyMyEmailDns(
  domainId: string,
): Promise<DomainResult<{ domain: CustomDomain; status: Exclude<EmailDnsStatus, 'unavailable'> }>> {
  try {
    const user = await requireUser()
    const owned = await getOwnedDomain(user.id, domainId)

    const limit = checkRateLimit(`email-dns:${user.id}`, EMAIL_DNS_RATE_LIMIT, EMAIL_DNS_RATE_WINDOW_MS)
    if (!limit.allowed) throw new DomainError('TEMPORARY_FAILURE')

    if (!isDomainUsable(owned)) throw new DomainError('DOMAIN_NOT_VERIFIED')

    const [plan, subscription] = await Promise.all([getMyCurrentPlan(), getMySubscription()])
    if (!getMailQuota(plan, subscription).allowed) throw new DomainError('NOT_ENTITLED')

    const outcome = await checkEmailDns(owned.domain, owned.dns, dohResolver)
    if (outcome.status === 'unavailable') throw new DomainError('TEMPORARY_FAILURE')

    const provider = getDomainProvider()
    const domain = provider.saveEmailDnsVerification
      ? await provider.saveEmailDnsVerification(domainId, outcome.records)
      : { ...owned, dns: outcome.records }

    revalidatePath(`/dashboard/domains/${domainId}`)
    revalidatePath('/dashboard/email')
    return { ok: true, data: { domain, status: outcome.status } }
  } catch (error) {
    return fail(error)
  }
}

export async function setMyPrimaryDomain(domainId: string): Promise<DomainResult<CustomDomain[]>> {
  try {
    const user = await requireUser()
    await getOwnedDomain(user.id, domainId)

    const domains = await getDomainProvider().setPrimary(user.id, domainId)

    revalidatePath('/dashboard/domains')
    return { ok: true, data: domains }
  } catch (error) {
    return fail(error)
  }
}

/* ------------------------------- admin side ------------------------------- */

/**
 * Read-only domain list for the admin area.
 *
 * Full admin domain management is intentionally out of scope for this pass;
 * this exists so the admin navigation and service seam are in place.
 */
export async function adminListAllDomains(): Promise<CustomDomain[]> {
  const { requireAdmin } = await import('@/lib/mail/admin-guard')
  await requireAdmin()
  return listAllDomains()
}
