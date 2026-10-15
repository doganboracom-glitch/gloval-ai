import { describe, expect, it, vi } from 'vitest'
import type { AiModelSelection } from '@/lib/ai-models'
import type { EmblemOutcome, EmblemRound } from './emblem-ai'
import { creditReasonFor, refundRound, runPaidRound, type CreditPort, type PaidRoundInput } from './paid-round'

const COST = 5
const selection: AiModelSelection = { flow: 'logoEmblem', tier: 'standard', model: 'anthropic/claude-sonnet-5.5', plan: 'starter' }

/** In-memory credit account that behaves like the consume/refund RPCs and the ledger. */
function fakeAccount(start: number) {
  const state = { balance: start, ledger: [] as { reason: string; amount: number }[] }
  const port: CreditPort = {
    balance: async () => state.balance,
    consume: async (_u, amount, reason) => {
      if (state.balance < amount) return { ok: false, balance: state.balance }
      state.balance -= amount
      state.ledger.push({ reason, amount: -amount })
      return { ok: true, balance: state.balance }
    },
    refund: async (_u, amount, reason) => {
      state.balance += amount
      state.ledger.push({ reason, amount })
      return state.balance
    },
    hasLedgerReason: async (_u, reason) => state.ledger.some((l) => l.reason === reason),
  }
  return { state, port }
}

const good = (i: number): EmblemOutcome => ({
  ok: true,
  attempts: 1,
  model: selection.model,
  kind: 'ok',
  emblem: { id: `ai-0-${i}`, source: 'ai', inner: '<circle/>', viewBox: { w: 200, h: 200 } },
})
const bad = (reason: string): EmblemOutcome => ({ ok: false, reason, attempts: 2 })

/** Fake model: slot i succeeds when `plan[i]` is true, otherwise fails with the given reason. */
function fakeModel(plan: (boolean | string)[]) {
  return vi.fn(async (r: EmblemRound): Promise<EmblemOutcome[]> =>
    Array.from({ length: r.count }, (_, i) => {
      const p = plan[i] ?? false
      return p === true ? good(i) : bad(typeof p === 'string' ? p : 'reddedildi')
    }),
  )
}

function input(over: Partial<PaidRoundInput> & Pick<PaidRoundInput, 'credits' | 'generate'>): PaidRoundInput {
  return {
    userId: 'u1',
    selection,
    cost: COST,
    maxCount: 4,
    round: { brand: 'Kasap Ahmet', style: 'modern', colors: ['#1d4ed8'], seed: 0, idPrefix: 'ai-0' },
    ...over,
  }
}

describe('paid logo round: credit rule', () => {
  it('charges 4 x cost when all four pass the gate', async () => {
    const { state, port } = fakeAccount(100)
    const r = await runPaidRound(input({ credits: port, generate: fakeModel([true, true, true, true]) }))
    expect(r).toMatchObject({ status: 'ok', charged: 20, balance: 80 })
    expect(state.balance).toBe(80)
  })

  it.each([
    [[true, true, true, 'zaman aşımı'], 3],
    [[true, 'reddedildi', 'model hatası', 'zaman aşımı'], 1],
    [[true, true], 2],
  ])('charges exactly the delivered count (%j -> %i emblems)', async (plan, delivered) => {
    const { state, port } = fakeAccount(100)
    const r = await runPaidRound(input({ credits: port, generate: fakeModel(plan as (boolean | string)[]) }))
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.emblems).toHaveLength(delivered)
    expect(state.balance).toBe(100 - COST * delivered)
    expect(state.ledger).toHaveLength(1)
  })

  it('charges nothing and reports failure when every emblem fails', async () => {
    const { state, port } = fakeAccount(100)
    const consume = vi.spyOn(port, 'consume')
    const r = await runPaidRound(
      input({ credits: port, generate: fakeModel(['zaman aşımı', 'model hatası', 'reddedildi', 'çıktı kesildi']) }),
    )
    expect(r).toMatchObject({ status: 'failed', balance: 100 })
    expect(r.status === 'failed' && r.failures).toHaveLength(4)
    expect(consume).not.toHaveBeenCalled()
    expect(state.balance).toBe(100)
    expect(state.ledger).toEqual([])
  })

  it('does not even draw when the balance cannot pay for one emblem', async () => {
    const { port } = fakeAccount(COST - 1)
    const generate = fakeModel([true])
    const r = await runPaidRound(input({ credits: port, generate }))
    expect(r).toMatchObject({ status: 'no_credits', balance: COST - 1 })
    expect(generate).not.toHaveBeenCalled()
  })

  it('draws only as many emblems as the balance covers and charges only passed ones', async () => {
    const { state, port } = fakeAccount(COST * 2 + 1)
    const generate = fakeModel([true, 'zaman aşımı'])
    const r = await runPaidRound(input({ credits: port, generate }))
    expect(generate.mock.calls[0][0].count).toBe(2)
    expect(r.status === 'ok' && r.emblems).toHaveLength(1)
    expect(state.balance).toBe(COST * 2 + 1 - COST)
  })

  it('delivers only what is still affordable when the balance drops while drawing', async () => {
    const { state, port } = fakeAccount(100)
    const generate = vi.fn(async (r: EmblemRound) => {
      state.balance = COST * 2 // spent elsewhere meanwhile
      return Array.from({ length: r.count }, (_, i) => good(i))
    })
    const r = await runPaidRound(input({ credits: port, generate }))
    expect(r.status === 'ok' && r.emblems).toHaveLength(2)
    expect(state.balance).toBe(0)
  })

  it('charges nothing if the client is gone before delivery', async () => {
    const { state, port } = fakeAccount(100)
    const r = await runPaidRound(input({ credits: port, generate: fakeModel([true, true, true, true]), isAborted: () => true }))
    expect(r.status).toBe('aborted')
    expect(state.balance).toBe(100)
  })

  it('refunds exactly the charge when delivery fails after charging', async () => {
    const { state, port } = fakeAccount(100)
    const r = await runPaidRound(input({ credits: port, generate: fakeModel([true, true, true, true]) }))
    if (r.status !== 'ok') throw new Error('expected ok')
    await refundRound(port, 'u1', r.charged, r.reason)
    expect(state.balance).toBe(100)
  })
})

describe('paid logo round: no double charge', () => {
  it('a retry with the same request id after success is rejected and not charged again', async () => {
    const { state, port } = fakeAccount(100)
    const generate = fakeModel([true, true, true, true])
    const first = await runPaidRound(input({ credits: port, requestId: 'req-12345678', generate }))
    const second = await runPaidRound(input({ credits: port, requestId: 'req-12345678', generate }))
    expect(first.status).toBe('ok')
    expect(second.status).toBe('duplicate')
    expect(state.balance).toBe(80)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(state.ledger[0].reason).toBe(creditReasonFor('req-12345678'))
  })

  it('a double click (two simultaneous identical requests) charges once', async () => {
    const { state, port } = fakeAccount(100)
    let release: () => void = () => undefined
    const gate = new Promise<void>((res) => (release = res))
    const generate = vi.fn(async (r: EmblemRound) => {
      await gate
      return Array.from({ length: r.count }, (_, i) => good(i))
    })
    const a = runPaidRound(input({ credits: port, requestId: 'req-dbl-click', generate }))
    const b = runPaidRound(input({ credits: port, requestId: 'req-dbl-click', generate }))
    release()
    const results = await Promise.all([a, b])
    expect(results.map((r) => r.status).sort()).toEqual(['duplicate', 'ok'])
    expect(state.balance).toBe(80)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('a failed round leaves the request id reusable: retrying it can succeed and charge once', async () => {
    const { state, port } = fakeAccount(100)
    const failed = await runPaidRound(input({ credits: port, requestId: 'req-retry-1', generate: fakeModel([]) }))
    expect(failed.status).toBe('failed')
    const retried = await runPaidRound(input({ credits: port, requestId: 'req-retry-1', generate: fakeModel([true, true, true, true]) }))
    expect(retried.status).toBe('ok')
    expect(state.balance).toBe(80)
  })

  it('different request ids are independent rounds', async () => {
    const { state, port } = fakeAccount(100)
    await runPaidRound(input({ credits: port, requestId: 'req-aaaaaaaa', generate: fakeModel([true, true, true, true]) }))
    await runPaidRound(input({ credits: port, requestId: 'req-bbbbbbbb', generate: fakeModel([true, true, true, true]) }))
    expect(state.balance).toBe(60)
  })
})

describe('paid logo round: monitoring record', () => {
  it('records one entry per delivered emblem only, with model and kind', async () => {
    const { port } = fakeAccount(100)
    const record = vi.fn()
    const fallbackHit: EmblemOutcome = { ...good(1), kind: 'fallback', model: 'anthropic/claude-sonnet-5.5' } as EmblemOutcome
    const generate = vi.fn(async (r: EmblemRound): Promise<EmblemOutcome[]> =>
      [good(0), fallbackHit, bad('zaman aşımı'), bad('reddedildi')].slice(0, r.count),
    )
    await runPaidRound(input({ credits: port, generate, record }))
    expect(record).toHaveBeenCalledWith([
      { model: selection.model, kind: 'ok' },
      { model: 'anthropic/claude-sonnet-5.5', kind: 'fallback' },
    ])
  })

  it('a failing monitor never breaks the paid delivery', async () => {
    const { state, port } = fakeAccount(100)
    const r = await runPaidRound(
      input({ credits: port, generate: fakeModel([true]), record: async () => { throw new Error('db down') } }),
    )
    expect(r.status).toBe('ok')
    expect(state.balance).toBe(95)
  })
})
