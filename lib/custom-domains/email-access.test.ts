import { describe, expect, it } from 'vitest'
import type { CustomDomain } from './types'
import { isEmailManagementAvailable } from './email-access'

const domain = (overrides: Partial<CustomDomain> = {}): CustomDomain => ({
  id: 'domain-1',
  userId: 'user-1',
  domain: 'example.com',
  status: 'active',
  isPrimary: false,
  dns: [],
  websiteProjectId: 'project-1',
  emailEnabled: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  connection: {
    dns: 'configured',
    vercel: 'connected',
    ssl: 'ready',
    lastCheckedAt: null,
    lastError: null,
    legacy: false,
  },
  mock: false,
  source: 'registrar',
  expiresAt: null,
  ...overrides,
})

describe('isEmailManagementAvailable', () => {
  it('allows a domain bound to a live site that is published for the owner', () => {
    expect(isEmailManagementAvailable(domain(), new Set(['project-1']))).toBe(true)
  })

  it('denies an unbound domain or a project that is not published', () => {
    expect(isEmailManagementAvailable(domain({ websiteProjectId: null }), new Set(['project-1']))).toBe(false)
    expect(isEmailManagementAvailable(domain(), new Set())).toBe(false)
  })

  it('denies a bound but unverified or non-live domain', () => {
    expect(isEmailManagementAvailable(domain({ status: 'pending' }), new Set(['project-1']))).toBe(false)
    expect(
      isEmailManagementAvailable(
        domain({ connection: { ...domain().connection, ssl: 'pending' } }),
        new Set(['project-1']),
      ),
    ).toBe(false)
  })
})
