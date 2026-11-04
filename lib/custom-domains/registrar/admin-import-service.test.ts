import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDomainRegistrarProvider: vi.fn(),
  lookupTargetByEmail: vi.fn(),
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/custom-domains/handover/service', () => ({ lookupTargetByEmail: mocks.lookupTargetByEmail }))
vi.mock('./provider', () => ({ getDomainRegistrarProvider: mocks.getDomainRegistrarProvider }))

import { previewRegistrarDomainImport, requestRegistrarDomainImport } from './admin-import-service'

const future = new Date(Date.now() + 86_400_000).toISOString()

function registrar(overrides: Record<string, unknown> = {}) {
  return {
    id: 'domainnameapi',
    live: true,
    getManagedDetails: vi.fn().mockResolvedValue({
      domain: 'owned-example.com.tr',
      status: 'Active',
      expiresAt: future,
      nameservers: ['ns1.example.net', 'NS2.EXAMPLE.NET.'],
    }),
    getContacts: vi.fn(),
    ...overrides,
  }
}

function adminClient() {
  return {
    rpc: mocks.rpc,
  }
}

describe('admin registrar import service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDomainRegistrarProvider.mockReturnValue(registrar())
    mocks.lookupTargetByEmail.mockResolvedValue({
      id: 'user-2',
      email: 'target@example.net',
      confirmed: true,
      banned: false,
      deleted: false,
      domainCount: 0,
    })
    mocks.createAdminClient.mockReturnValue(adminClient())
    mocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        status: 'imported',
        request_id: 'request-1',
        domain: 'owned-example.com.tr',
        order_id: 'order-1',
        custom_domain_id: 'domain-1',
        requires_second_admin: false,
        replayed: false,
      },
      error: null,
    })
  })

  it('previews only an active domain returned by the live account-scoped GetDetails call', async () => {
    const provider = registrar()
    mocks.getDomainRegistrarProvider.mockReturnValue(provider)

    await expect(previewRegistrarDomainImport('https://www.owned-example.com.tr/')).resolves.toEqual({
      ok: true,
      preview: {
        domain: 'owned-example.com.tr',
        expiresAt: future,
        nameservers: ['ns1.example.net', 'ns2.example.net'],
      },
    })
    expect(provider.getManagedDetails).toHaveBeenCalledTimes(1)
    expect(provider.getManagedDetails).toHaveBeenCalledWith('owned-example.com.tr')
    expect(provider.getContacts).not.toHaveBeenCalled()
  })

  it('rejects a domain not returned by this reseller account without calling the import RPC', async () => {
    const provider = registrar({ getManagedDetails: vi.fn().mockResolvedValue(null) })
    mocks.getDomainRegistrarProvider.mockReturnValue(provider)

    await expect(previewRegistrarDomainImport('someone-elses-domain.com')).resolves.toEqual({
      ok: false,
      error: 'domain_not_owned',
    })
    expect(provider.getManagedDetails).toHaveBeenCalledWith('someone-elses-domain.com')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('never calls the registrar before the target email and reason are validated', async () => {
    const provider = registrar()
    mocks.getDomainRegistrarProvider.mockReturnValue(provider)

    await expect(
      requestRegistrarDomainImport({
        domain: 'owned-example.com.tr',
        targetEmail: 'not-an-email',
        reason: 'TKT-42',
        idempotencyKey: 'idempotency-123',
        actor: { userId: 'admin-1', email: 'admin@example.net' },
      }),
    ).resolves.toEqual({ ok: false, error: 'invalid_email' })
    expect(provider.getManagedDetails).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('passes an idempotency key and only sanitized registrar metadata to the transaction RPC', async () => {
    const result = await requestRegistrarDomainImport({
      domain: 'owned-example.com.tr',
      targetEmail: 'TARGET@example.net',
      reason: 'TKT-2026-119',
      idempotencyKey: 'idempotency-123',
      actor: { userId: 'admin-1', email: 'ADMIN@example.net' },
    })

    expect(result).toMatchObject({ ok: true, status: 'imported', requestId: 'request-1' })
    expect(mocks.lookupTargetByEmail).toHaveBeenCalledWith('target@example.net')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_request_domain_import',
      expect.objectContaining({
        p_domain: 'owned-example.com.tr',
        p_target_user_id: 'user-2',
        p_target_email: 'target@example.net',
        p_requested_by_user_id: 'admin-1',
        p_requested_by_email: 'admin@example.net',
        p_reason: 'TKT-2026-119',
        p_idempotency_key: 'idempotency-123',
        p_provider_domain_id: 'owned-example.com.tr',
        p_expires_at: future,
        p_registrar_nameservers: ['ns1.example.net', 'ns2.example.net'],
      }),
    )
    const rpcInput = mocks.rpc.mock.calls[0][1]
    expect(JSON.stringify(rpcInput)).not.toContain('contact')
    expect(JSON.stringify(rpcInput)).not.toContain('whois')
  })
})
