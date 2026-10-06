import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegistrarError } from './types'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  startTransferIn: vi.fn(),
  getOwnedDomainInfo: vi.fn(),
  addDomain: vi.fn(),
}))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  let wantRows = false
  const run = () => {
    const matched = (state.db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') for (const r of matched) Object.assign(r, patch)
    return matched.map((r) => ({ ...r }))
  }
  const b: Record<string, unknown> = {
    select() {
      if (mode === 'update') wantRows = true
      return b
    },
    update(p: Row) {
      mode = 'update'
      patch = p
      return b
    },
    eq(c: string, v: unknown) {
      filters.push((r) => r[c] === v)
      return b
    },
    in(c: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[c]))
      return b
    },
    lt(c: string, v: string) {
      filters.push((r) => typeof r[c] === 'string' && (r[c] as string) < v)
      return b
    },
    order() {
      return b
    },
    limit() {
      return b
    },
    maybeSingle() {
      return Promise.resolve({ data: run()[0] ?? null, error: null })
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: mode === 'update' && !wantRows ? null : rows, error: null }).then(res, rej)
    },
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('../provider', () => ({ getDomainProvider: () => ({ addDomain: state.addDomain }) }))
vi.mock('./provider', () => ({
  getDomainRegistrarProvider: () => ({
    startTransferIn: state.startTransferIn,
    getOwnedDomainInfo: state.getOwnedDomainInfo,
    checkTransferIn: vi.fn(),
    getTransferPrice: vi.fn(),
    setTransferLock: vi.fn(),
    getAuthCode: vi.fn(),
  }),
}))

import { encryptAuthCode } from './transfer-crypto'
import {
  finalizeTransferIn,
  isTransferSupportedTld,
  syncAllTransfers,
  syncTransfersForUser,
  sweepStaleTransfers,
} from './transfer-service'

const EPP = 'EPP-SECRET-xyz-987'
const transfer = () => state.db.domain_transfers[0]

function seed(status: string, withCode = true) {
  state.db = {
    domain_transfers: [
      {
        id: 't-1',
        user_id: 'user-1',
        domain: 'example.com',
        period_years: 1,
        status,
        auth_code_enc: withCode ? encryptAuthCode(EPP) : null,
      },
    ],
  }
}

beforeEach(() => {
  process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
  vi.clearAllMocks()
  state.startTransferIn.mockResolvedValue({ providerStatus: 'pending' })
  state.getOwnedDomainInfo.mockResolvedValue(null)
  state.addDomain.mockResolvedValue({ id: 'cd-1' })
})

describe('isTransferSupportedTld', () => {
  it.each([
    ['com', true],
    ['net', true],
    ['org', true],
    ['tr', false],
    ['com.tr', false],
    ['org.tr', false],
    ['COM.TR', false],
  ])('%s -> %s', (tld, expected) => {
    expect(isTransferSupportedTld(tld)).toBe(expected)
  })
})

describe('finalizeTransferIn', () => {
  it('submits the decrypted code once and leaves the order pending (never completed)', async () => {
    seed('payment_verified')
    await finalizeTransferIn('t-1')
    expect(state.startTransferIn).toHaveBeenCalledWith('example.com', EPP, 1)
    expect(transfer().status).toBe('transfer_pending')
    expect(transfer().status).not.toBe('completed')
    expect(transfer().auth_code_enc).toBeNull()
    expect(JSON.stringify(transfer())).not.toContain(EPP)
  })

  it('does not submit an unpaid-state-agnostic duplicate: repeated callbacks submit once', async () => {
    seed('payment_verified')
    await finalizeTransferIn('t-1')
    await finalizeTransferIn('t-1')
    expect(state.startTransferIn).toHaveBeenCalledTimes(1)
  })

  it('concurrent callbacks submit exactly once', async () => {
    seed('payment_verified')
    state.startTransferIn.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { providerStatus: 'pending' }
    })
    await Promise.all([finalizeTransferIn('t-1'), finalizeTransferIn('t-1'), finalizeTransferIn('t-1')])
    expect(state.startTransferIn).toHaveBeenCalledTimes(1)
  })

  it.each(['transfer_submitting', 'transfer_pending', 'completed', 'failed', 'cancelled'])(
    'ignores an order already in %s',
    async (status) => {
      seed(status)
      await finalizeTransferIn('t-1')
      expect(state.startTransferIn).not.toHaveBeenCalled()
      expect(transfer().status).toBe(status)
    },
  )

  it('fails closed with a safe code when the stored code cannot be decrypted', async () => {
    seed('payment_verified')
    process.env.DOMAIN_TRANSFER_SECRET = 'rotated-secret-that-is-different'
    await finalizeTransferIn('t-1')
    expect(state.startTransferIn).not.toHaveBeenCalled()
    expect(transfer().status).toBe('failed')
    expect(transfer().error_message).toBe('auth_code_unavailable')
  })

  it('fails when the secret is missing', async () => {
    seed('payment_verified')
    delete process.env.DOMAIN_TRANSFER_SECRET
    await finalizeTransferIn('t-1')
    expect(transfer().status).toBe('failed')
    expect(state.startTransferIn).not.toHaveBeenCalled()
  })

  it('unknown provider outcome requires reconciliation and never leaks the EPP code', async () => {
    seed('payment_verified')
    state.startTransferIn.mockRejectedValue(new Error('domainnameapi:TRANSFER_EXCEPTION'))
    await finalizeTransferIn('t-1')
    expect(transfer().status).toBe('transfer_reconciliation_required')
    expect(transfer().error_message).toBe('domainnameapi:TRANSFER_EXCEPTION')
    expect(transfer().auth_code_enc).toBeNull()
    expect(JSON.stringify(transfer())).not.toContain(EPP)
  })

  it('a definitive registrar rejection marks the order failed', async () => {
    seed('payment_verified')
    state.startTransferIn.mockRejectedValue(new RegistrarError('UNAVAILABLE'))
    await finalizeTransferIn('t-1')
    expect(transfer().status).toBe('failed')
    expect(transfer().auth_code_enc).toBeNull()
  })
})

describe('syncTransfersForUser', () => {
  it('keeps a transfer pending while the registrar does not own the domain yet', async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockResolvedValue(null)
    await syncTransfersForUser('user-1')
    expect(transfer().status).toBe('transfer_pending')
    expect(state.addDomain).not.toHaveBeenCalled()
  })

  it('keeps it pending when the provider reports a non-active status', async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockResolvedValue({ status: 'Pending', expiresAt: null })
    await syncTransfersForUser('user-1')
    expect(transfer().status).toBe('transfer_pending')
  })

  it('completes and attaches the domain once the provider reports it active', async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockResolvedValue({ status: 'Active', expiresAt: '2031-01-01' })
    await syncTransfersForUser('user-1')
    expect(transfer().status).toBe('completed')
    expect(transfer().custom_domain_id).toBe('cd-1')
    expect(state.addDomain).toHaveBeenCalledTimes(1)
  })

  it('concurrent syncs attach the domain only once', async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockResolvedValue({ status: 'Active', expiresAt: '2031-01-01' })
    await Promise.all([syncTransfersForUser('user-1'), syncTransfersForUser('user-1')])
    expect(state.addDomain).toHaveBeenCalledTimes(1)
  })

  it('a provider timeout on sync leaves the order untouched', async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockRejectedValue(new Error('domainnameapi:DETAILS_EXCEPTION'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await syncTransfersForUser('user-1')
    expect(transfer().status).toBe('transfer_pending')
  })

  it("never touches another user's transfers", async () => {
    seed('transfer_pending', false)
    state.getOwnedDomainInfo.mockResolvedValue({ status: 'Active', expiresAt: null })
    await syncTransfersForUser('someone-else')
    expect(transfer().status).toBe('transfer_pending')
  })
})

describe('stale sweep and syncAllTransfers', () => {
  const old = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

  it('moves only old transfer_submitting rows to reconciliation, drops the code, never calls the registrar', async () => {
    seed('transfer_submitting')
    transfer().updated_at = old()
    expect(await sweepStaleTransfers()).toBe(1)
    expect(transfer().status).toBe('transfer_reconciliation_required')
    expect(transfer().auth_code_enc).toBeNull()
    expect(state.startTransferIn).not.toHaveBeenCalled()
  })

  it('leaves a fresh transfer_submitting row alone', async () => {
    seed('transfer_submitting')
    transfer().updated_at = new Date().toISOString()
    expect(await sweepStaleTransfers()).toBe(0)
    expect(transfer().status).toBe('transfer_submitting')
  })

  it('a second concurrent sweep does not re-process the row', async () => {
    seed('transfer_submitting')
    transfer().updated_at = old()
    const [a, b] = await Promise.all([sweepStaleTransfers(), sweepStaleTransfers()])
    expect(a + b).toBe(1)
  })

  it('syncAllTransfers (no user filter) covers every user and keeps unresolved rows uncertain', async () => {
    state.db = {
      domain_transfers: [
        { id: 't-1', user_id: 'user-1', domain: 'a.com', status: 'transfer_submitting', updated_at: old() },
        { id: 't-2', user_id: 'user-2', domain: 'b.com', status: 'transfer_pending', updated_at: old() },
      ],
    }
    state.getOwnedDomainInfo.mockResolvedValue(null)
    const res = await syncAllTransfers()
    expect(res).toEqual({ swept: 1, checked: 2 })
    expect(state.db.domain_transfers.map((r) => r.status)).toEqual([
      'transfer_reconciliation_required',
      'transfer_pending',
    ])
    expect(state.startTransferIn).not.toHaveBeenCalled()
  })
})
