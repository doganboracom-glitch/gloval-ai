import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  admin: { from: vi.fn() },
  decrypt: vi.fn(() => 'access-token'),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/ads/token-crypto', () => ({
  decryptAdsToken: mocks.decrypt,
  encryptAdsToken: vi.fn(),
  loadAdsTokenKeyring: vi.fn(() => ({})),
}))

import { disconnectMetaConnection } from '@/lib/ads/meta-connections'

const baseRow = {
  id: 'conn-1',
  user_id: 'user-1',
  platform: 'meta',
  external_account_id: 'act_1',
  refresh_token_enc: 'enc',
  status: 'active',
  meta_user_id: 'fb-user-1',
}

function chain(result: unknown) {
  const node: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'update']) node[method] = vi.fn(() => node)
  node.maybeSingle = vi.fn(async () => result)
  node.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return node
}

function setup(sharing: { count: number | null; error: unknown }) {
  const calls: Record<string, unknown>[] = []
  const queue = [
    chain({ data: baseRow, error: null }),
    chain(sharing),
    chain({ error: null }),
  ]
  mocks.admin.from.mockImplementation(() => {
    const next = queue.shift()!
    calls.push(next)
    return next
  })
  const provider = { revokePermissions: vi.fn().mockResolvedValue(undefined) }
  return { provider, calls }
}

beforeEach(() => vi.clearAllMocks())

describe('disconnectMetaConnection', () => {
  it('revokes the Meta grant when no other active connection shares the Meta user', async () => {
    const { provider, calls } = setup({ count: 0, error: null })
    await disconnectMetaConnection({ userId: 'user-1', connectionId: 'conn-1', provider: provider as never })
    expect(provider.revokePermissions).toHaveBeenCalledOnce()
    expect((calls[1].neq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('id', 'conn-1')
    expect((calls[2].update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', refresh_token_enc: null }))
  })

  it('skips the remote revoke but still drops the local token when another active connection shares the Meta user', async () => {
    const { provider, calls } = setup({ count: 2, error: null })
    await disconnectMetaConnection({ userId: 'user-1', connectionId: 'conn-1', provider: provider as never })
    expect(provider.revokePermissions).not.toHaveBeenCalled()
    expect((calls[2].update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', refresh_token_enc: null }))
  })

  it('skips the remote revoke when the sharing lookup fails', async () => {
    const { provider } = setup({ count: null, error: { message: 'boom' } })
    await disconnectMetaConnection({ userId: 'user-1', connectionId: 'conn-1', provider: provider as never })
    expect(provider.revokePermissions).not.toHaveBeenCalled()
  })
})
