import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let failure: string | null = null
const seen: string[] = []
vi.mock('@/lib/store-payments/owner-auth', () => ({
  authorizeProjectOwner: async (projectId: string) => {
    seen.push(projectId)
    if (failure) throw new Error(failure)
    return { ownerId: 'o', actorId: 'o' }
  },
}))

import { resolveCustomersPageAccess } from '@/lib/store-customers-page-access'

beforeEach(() => {
  failure = null
  seen.length = 0
})

describe('resolveCustomersPageAccess', () => {
  it('allows the owner (or an allow-listed admin)', async () => {
    expect(await resolveCustomersPageAccess('p1')).toBe('allowed')
    expect(seen).toEqual(['p1'])
  })

  it('sends signed-out visitors to login', async () => {
    failure = 'UNAUTHENTICATED'
    expect(await resolveCustomersPageAccess('p1')).toBe('login')
  })

  it('hides the project from a signed-in non-owner', async () => {
    failure = 'NOT_FOUND'
    expect(await resolveCustomersPageAccess('p1')).toBe('not_found')
  })

  it('fails closed on unexpected errors', async () => {
    failure = 'boom'
    expect(await resolveCustomersPageAccess('p1')).toBe('not_found')
  })
})
