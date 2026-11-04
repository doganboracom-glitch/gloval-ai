// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({
  strings: new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ t: { domains: state.strings } }),
}))
vi.mock('@/components/domains/domain-chrome', () => ({
  DomainShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  fill: (template: string) => template,
}))
vi.mock('@/components/domains/domain-email-manage-button', () => ({ DomainEmailManageButton: () => null }))
vi.mock('@/components/domains/connection-status', () => ({ ConnectionStatus: () => null }))
vi.mock('@/components/domains/transfer-out-panel', () => ({ TransferOutPanel: () => null }))
vi.mock('@/components/domains/registrar-manage-panel', () => ({ RegistrarManagePanel: () => null }))
vi.mock('@/lib/custom-domains/actions', () => ({ syncMyDomainToProject: vi.fn() }))

import { PurchasedDomainDetail } from './purchased-domain-detail'
import type { DomainDetail } from '@/lib/custom-domains/actions'

const detail = (adminAssigned: boolean): DomainDetail => ({
  domain: {
    id: 'domain-1',
    userId: 'user-1',
    domain: 'dbajans.com',
    status: 'active',
    isPrimary: false,
    dns: [],
    websiteProjectId: null,
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
    adminAssigned,
    expiresAt: '2027-01-01T00:00:00.000Z',
  },
  live: true,
  website: { projectId: null, projectName: null },
  email: { entitled: false, mailboxCount: 0, maxMailboxes: 0 },
})

describe('admin-assigned domain label', () => {
  it('uses the administrator-assignment copy only for imported domains', () => {
    const { rerender } = render(<PurchasedDomainDetail detail={detail(true)} userEmail="owner@example.com" projects={[]} />)
    expect(screen.getByText('pdAssignedLine')).toBeTruthy()
    expect(screen.queryByText('pdRegisteredLine')).toBeNull()

    rerender(<PurchasedDomainDetail detail={detail(false)} userEmail="owner@example.com" projects={[]} />)
    expect(screen.getByText('pdRegisteredLine')).toBeTruthy()
    expect(screen.queryByText('pdAssignedLine')).toBeNull()
  })
})
