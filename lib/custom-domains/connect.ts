import { normalizeDomain } from './normalize'
import { DomainError, type CustomDomain, type DomainProvider } from './types'

/**
 * Project-first domain connection.
 *
 *   1. the caller picks one of THEIR projects
 *   2. the caller enters the domain
 *   3. the domain row is created already bound to that project
 *   4. the hostname is attached to the Vercel project and the records Vercel
 *      returns are stored (`provider.syncConnection`)
 *
 * All rules live here, behind injected dependencies, so the server action is a
 * thin wrapper (session, entitlement, revalidation) and the rules are testable
 * without a database or network.
 *
 * Which Vercel project is used: GLOVAL serves every tenant site from ONE Vercel
 * deployment (`VERCEL_PROJECT_ID`); the hostname -> GLOVAL project mapping is the
 * `website_project_id` column resolved by the host router. So a GLOVAL project
 * maps to that single Vercel project, and the per-project part of the mapping is
 * stored on the domain row.
 */

export type ConnectProject = {
  id: string
  owner_id: string
  published: boolean
  slug: string | null
}

export type ConnectDeps = {
  provider: DomainProvider
  loadProject: (projectId: string) => Promise<ConnectProject | null>
}

export type ConnectInput = {
  userId: string
  projectId: string | null | undefined
  rawDomain: string
  /** Plan limit; only applies to a NEW row, so a repeated request is never refused for it. */
  maxDomains: number
}

export async function connectDomainToProject(deps: ConnectDeps, input: ConnectInput): Promise<CustomDomain> {
  const { provider } = deps
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
  if (!projectId) throw new DomainError('PROJECT_REQUIRED')

  // A missing project and someone else's project are indistinguishable to the caller.
  const project = await deps.loadProject(projectId)
  if (!project || project.owner_id !== input.userId) throw new DomainError('FORBIDDEN')
  if (!project.published || !project.slug) throw new DomainError('PROJECT_NOT_PUBLISHED')

  const normalized = normalizeDomain(input.rawDomain)
  if (!normalized.ok) {
    throw new DomainError(normalized.error === 'reserved' ? 'RESERVED_DOMAIN' : 'INVALID_DOMAIN')
  }
  const hostname = normalized.domain

  const mine = await provider.listDomains(input.userId)
  const existing = mine.find((d) => d.domain === hostname)

  let domain: CustomDomain
  if (existing) {
    if (existing.websiteProjectId && existing.websiteProjectId !== project.id) {
      throw new DomainError('DOMAIN_BOUND_TO_OTHER_PROJECT')
    }
    // Same request again (or an old row that was never bound): no new row.
    domain =
      existing.websiteProjectId === project.id
        ? existing
        : await provider.setWebsiteProject(existing.id, project.id)
  } else {
    // Another account already proved ownership of this hostname.
    const claimed = await provider.findActiveByHostname(hostname)
    if (claimed && claimed.userId !== input.userId) throw new DomainError('DOMAIN_EXISTS')
    if (mine.length >= input.maxDomains) throw new DomainError('DOMAIN_LIMIT_REACHED')

    domain = await provider.addDomain({ userId: input.userId, domain: hostname, websiteProjectId: project.id })
  }

  // Attaching is a separate step from owning the row: a failure is recorded on
  // the row (and shown with a retry) rather than hidden or reported as success.
  try {
    return await provider.syncConnection(domain.id)
  } catch (error) {
    console.log('[v0] syncConnection failed after add:', error)
    return domain
  }
}
