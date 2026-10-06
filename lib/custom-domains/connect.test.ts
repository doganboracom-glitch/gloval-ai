import { describe, expect, it, vi } from 'vitest'
import { connectDomainToProject, type ConnectProject } from './connect'
import { DomainError, type CustomDomain, type DomainProvider } from './types'

const USER = 'user-1'
const PROJECT: ConnectProject = { id: 'p1', owner_id: USER, published: true, slug: 'acme' }

function row(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    id: 'd1',
    userId: USER,
    domain: 'example.com',
    status: 'pending',
    websiteProjectId: null,
    ...overrides,
  } as CustomDomain
}

function setup(opts: {
  mine?: CustomDomain[]
  claimed?: CustomDomain | null
  project?: ConnectProject | null
  syncFails?: boolean
}) {
  const mine = opts.mine ?? []
  const provider = {
    listDomains: vi.fn(async () => mine),
    findActiveByHostname: vi.fn(async () => opts.claimed ?? null),
    addDomain: vi.fn(async (input: { domain: string; websiteProjectId?: string | null }) =>
      row({ id: 'new', domain: input.domain, websiteProjectId: input.websiteProjectId ?? null }),
    ),
    setWebsiteProject: vi.fn(async (id: string, projectId: string) =>
      row({ id, domain: mine[0]?.domain ?? 'example.com', websiteProjectId: projectId }),
    ),
    syncConnection: vi.fn(async (id: string) => {
      if (opts.syncFails) throw new Error('vercel down')
      return row({ id, vercelStatus: 'pending' } as Partial<CustomDomain>)
    }),
  }
  const deps = {
    provider: provider as unknown as DomainProvider,
    loadProject: vi.fn(async () => (opts.project === undefined ? PROJECT : opts.project)),
  }
  return { provider, deps }
}

const base = { userId: USER, projectId: 'p1', rawDomain: 'Example.com', maxDomains: 3 }

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR'
  }
}

describe('connectDomainToProject', () => {
  it('requires a project before anything else is touched', async () => {
    const { provider, deps } = setup({})
    expect(await codeOf(connectDomainToProject(deps, { ...base, projectId: null }))).toBe('PROJECT_REQUIRED')
    expect(await codeOf(connectDomainToProject(deps, { ...base, projectId: '  ' }))).toBe('PROJECT_REQUIRED')
    expect(provider.addDomain).not.toHaveBeenCalled()
  })

  it('treats a missing project and another user\'s project the same way', async () => {
    const missing = setup({ project: null })
    expect(await codeOf(connectDomainToProject(missing.deps, base))).toBe('FORBIDDEN')

    const foreign = setup({ project: { ...PROJECT, owner_id: 'someone-else' } })
    expect(await codeOf(connectDomainToProject(foreign.deps, base))).toBe('FORBIDDEN')
    expect(foreign.provider.addDomain).not.toHaveBeenCalled()
  })

  it('refuses unpublished projects', async () => {
    const draft = setup({ project: { ...PROJECT, published: false } })
    expect(await codeOf(connectDomainToProject(draft.deps, base))).toBe('PROJECT_NOT_PUBLISHED')

    const noSlug = setup({ project: { ...PROJECT, slug: null } })
    expect(await codeOf(connectDomainToProject(noSlug.deps, base))).toBe('PROJECT_NOT_PUBLISHED')
  })

  it('rejects invalid and reserved hostnames', async () => {
    const { deps } = setup({})
    expect(await codeOf(connectDomainToProject(deps, { ...base, rawDomain: 'not a domain' }))).toBe('INVALID_DOMAIN')
    expect(await codeOf(connectDomainToProject(deps, { ...base, rawDomain: 'gloval.ai' }))).toBe('RESERVED_DOMAIN')
  })

  it('creates the row already bound to the chosen project, then syncs with Vercel', async () => {
    const { provider, deps } = setup({})
    const result = await connectDomainToProject(deps, base)

    expect(provider.addDomain).toHaveBeenCalledWith({
      userId: USER,
      domain: 'example.com',
      websiteProjectId: 'p1',
    })
    expect(provider.syncConnection).toHaveBeenCalledWith('new')
    expect(result.id).toBe('new')
  })

  it('is idempotent: the same request again adds no new row', async () => {
    const existing = row({ websiteProjectId: 'p1' })
    const { provider, deps } = setup({ mine: [existing] })
    const result = await connectDomainToProject(deps, base)

    expect(provider.addDomain).not.toHaveBeenCalled()
    expect(provider.setWebsiteProject).not.toHaveBeenCalled()
    expect(provider.syncConnection).toHaveBeenCalledWith(existing.id)
    expect(result.id).toBe(existing.id)
  })

  it('never silently re-binds a domain that belongs to another project', async () => {
    const { provider, deps } = setup({ mine: [row({ websiteProjectId: 'other-project' })] })
    expect(await codeOf(connectDomainToProject(deps, base))).toBe('DOMAIN_BOUND_TO_OTHER_PROJECT')
    expect(provider.setWebsiteProject).not.toHaveBeenCalled()
    expect(provider.syncConnection).not.toHaveBeenCalled()
  })

  it('binds an older row that was never attached to a project', async () => {
    const legacy = row({ websiteProjectId: null })
    const { provider, deps } = setup({ mine: [legacy] })
    await connectDomainToProject(deps, base)

    expect(provider.setWebsiteProject).toHaveBeenCalledWith(legacy.id, 'p1')
    expect(provider.addDomain).not.toHaveBeenCalled()
  })

  it('refuses a hostname another account has already proven', async () => {
    const { provider, deps } = setup({ claimed: row({ userId: 'someone-else', status: 'active' }) })
    expect(await codeOf(connectDomainToProject(deps, base))).toBe('DOMAIN_EXISTS')
    expect(provider.addDomain).not.toHaveBeenCalled()
  })

  it('enforces the plan limit for new rows only', async () => {
    const full = [row({ id: 'a', domain: 'a.com' }), row({ id: 'b', domain: 'b.com' })]
    const atLimit = setup({ mine: full })
    expect(await codeOf(connectDomainToProject(atLimit.deps, { ...base, maxDomains: 2 }))).toBe('DOMAIN_LIMIT_REACHED')

    // Re-running for a domain the account already has must not be blocked by the limit.
    const repeat = setup({ mine: [row({ websiteProjectId: 'p1' })] })
    expect(await codeOf(connectDomainToProject(repeat.deps, { ...base, maxDomains: 1 }))).toBeNull()
  })

  it('keeps the row and returns it when the Vercel attach fails', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { provider, deps } = setup({ syncFails: true })
    const result = await connectDomainToProject(deps, base)

    expect(provider.addDomain).toHaveBeenCalledOnce()
    expect(result.id).toBe('new')
    log.mockRestore()
  })
})
