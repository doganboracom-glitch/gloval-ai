import { describe, expect, it, vi } from 'vitest'
import {
  STORE_AI_COSTS,
  STORE_AI_FREE_CYCLE,
  STORE_AI_LIMITS,
  costForAttempt,
  costLabel,
  describeNextAttempt,
  type StoreAiKind,
} from './store-ai-constants'
import {
  StoreAiInvalidResult,
  StoreAiRefusal,
  readStoreAiStatus,
  runMeteredStoreAi,
  type BeginInput,
  type BeginResult,
  type FinishStatus,
  type MeteredInput,
  type StoreAiPort,
} from './store-ai-engine'

/**
 * In-memory model of scripts/039 (same rules, same order). A mutex stands in for
 * the per-user advisory lock so concurrent callers are serialized like in SQL.
 */
function createFakePort(opts: { balance?: number; productOwners?: Record<string, string> } = {}) {
  let now = 1_000_000
  const ledger: Array<{ amount: number; reason: string }> = [{ amount: opts.balance ?? 10, reason: 'gift' }]
  const series = new Map<string, number>()
  const attempts: Array<{
    id: string
    requestId: string
    key: string
    kind: StoreAiKind
    no: number
    charged: number
    status: 'pending' | 'succeeded' | 'failed'
    at: number
  }> = []
  let seq = 0
  let lock: Promise<unknown> = Promise.resolve()
  const sum = () => ledger.reduce((total, row) => total + row.amount, 0)
  const serialize = <T>(fn: () => T): Promise<T> => {
    const run = lock.then(fn)
    lock = run.catch(() => undefined)
    return run
  }
  const keyOf = (project: string, product: string, kind: string) => `${project}|${product}|${kind}`

  function refund(attempt: (typeof attempts)[number]) {
    if (attempt.charged > 0) ledger.push({ amount: attempt.charged, reason: `store_ai_refund:${attempt.id}` })
  }

  const port: StoreAiPort = {
    begin: (input: BeginInput) =>
      serialize((): BeginResult => {
        const result = (outcome: BeginResult['outcome'], extra: Partial<BeginResult> = {}): BeginResult => ({
          outcome,
          attemptId: null,
          attemptNo: 0,
          charged: 0,
          balance: 0,
          ...extra,
        })
        for (const stale of attempts.filter((a) => a.status === 'pending' && now - a.at > STORE_AI_LIMITS.staleSeconds * 1000)) {
          stale.status = 'failed'
          refund(stale)
        }
        const existing = attempts.find((a) => a.requestId === input.requestId)
        if (existing) return result('replay', { attemptId: existing.id, attemptNo: existing.no, charged: existing.charged })
        if (attempts.filter((a) => a.status === 'pending').length >= STORE_AI_LIMITS.concurrent) return result('busy')
        if (attempts.filter((a) => now - a.at < 60_000).length >= STORE_AI_LIMITS.perMinute) return result('rate_minute')
        if (attempts.filter((a) => now - a.at < 86_400_000).length >= STORE_AI_LIMITS.daily) return result('rate_daily')

        const key = keyOf(input.projectId, input.productKey, input.kind)
        const n = (series.get(key) ?? 0) + 1
        const charge = costForAttempt(input.kind, n)
        const id = `attempt-${(seq += 1)}`
        if (charge > 0) {
          if (sum() < charge) return result('insufficient', { attemptNo: n, charged: charge, balance: sum() })
          ledger.push({ amount: -charge, reason: `store_ai_${input.kind}:${id}` })
        }
        attempts.push({ id, requestId: input.requestId, key, kind: input.kind, no: n, charged: charge, status: 'pending', at: now })
        return result('started', { attemptId: id, attemptNo: n, charged: charge, balance: sum() })
      }),
    finish: (attemptId, success) =>
      serialize((): FinishStatus => {
        const attempt = attempts.find((a) => a.id === attemptId)
        if (!attempt) return 'not_found'
        if (attempt.status !== 'pending') return attempt.status
        if (success) {
          attempt.status = 'succeeded'
          series.set(attempt.key, (series.get(attempt.key) ?? 0) + 1)
          return 'succeeded'
        }
        attempt.status = 'failed'
        refund(attempt)
        return 'failed'
      }),
    resetSeries: async (projectId, productKey, kind) => {
      series.set(keyOf(projectId, productKey, kind), 0)
    },
    readSucceededCount: async (projectId, productKey, kind) => series.get(keyOf(projectId, productKey, kind)) ?? 0,
    recentCount: async (_userId, kind, windowMs) =>
      attempts.filter((a) => a.kind === kind && now - a.at < windowMs).length,
    balance: async () => sum(),
    findProductProject: async (productKey) => opts.productOwners?.[productKey] ?? null,
  }

  return {
    port,
    ledger,
    attempts,
    balance: sum,
    advance: (ms: number) => {
      now += ms
    },
  }
}

const base = { userId: 'u1', projectId: 'p1', productKey: 'k1', kind: 'text' as const }
let counter = 0
const req = () => `req-${(counter += 1)}`

async function attempt(port: StoreAiPort, work: () => Promise<string> = async () => 'ok', overrides: Partial<MeteredInput> = {}) {
  return runMeteredStoreAi(port, { ...base, requestId: req(), ...overrides }, work)
}

describe('constants', () => {
  it('charges attempts 1, 4, 7 and leaves 2, 3, 5, 6, 8, 9 free', () => {
    const charged = Array.from({ length: 9 }, (_, i) => costForAttempt('text', i + 1))
    expect(charged).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0])
    expect(STORE_AI_FREE_CYCLE).toEqual({ text: 3, image: 2 })
  })

  it('image attempts use the image price on the same cycle', () => {
    expect(costForAttempt('image', 1)).toBe(STORE_AI_COSTS.image)
    expect(costForAttempt('image', 2)).toBe(0)
  })

  it('labels the button before the click', () => {
    expect(costLabel(describeNextAttempt('text', 0))).toBe('1 kredi')
    expect(costLabel(describeNextAttempt('text', 1))).toBe('Bu deneme ücretsiz (2/3)')
    expect(costLabel(describeNextAttempt('text', 2))).toBe('Bu deneme ücretsiz (3/3)')
    expect(costLabel(describeNextAttempt('text', 3))).toBe('1 kredi')
  })
})

describe('retry cycle through the engine', () => {
  it('spends 3 credits over 9 successful attempts', async () => {
    const fake = createFakePort({ balance: 10 })
    for (let i = 0; i < 9; i += 1) {
      fake.advance(61_000)
      const result = await attempt(fake.port)
      expect(result.ok).toBe(true)
    }
    expect(fake.balance()).toBe(7)
    expect(fake.attempts.map((a) => a.charged)).toEqual([1, 0, 0, 1, 0, 0, 1, 0, 0])
  })

  it('refunds a failed paid attempt and does not advance the series', async () => {
    const fake = createFakePort({ balance: 5 })
    const failed = await attempt(fake.port, async () => {
      throw new Error('model down')
    })
    expect(failed).toMatchObject({ ok: false, error: 'generation_failed', refunded: 1 })
    expect(fake.balance()).toBe(5)

    fake.advance(61_000)
    const retry = await attempt(fake.port)
    expect(retry).toMatchObject({ ok: true, attemptNo: 1, charged: 1 })
    expect(fake.balance()).toBe(4)
  })

  it('treats an invalid or refused result as a failure with refund', async () => {
    const fake = createFakePort({ balance: 5 })
    const invalid = await attempt(fake.port, async () => {
      throw new StoreAiInvalidResult()
    })
    expect(invalid).toMatchObject({ ok: false, error: 'generation_failed', refunded: 1 })
    fake.advance(61_000)
    const refused = await attempt(fake.port, async () => {
      throw new StoreAiRefusal()
    })
    expect(refused).toMatchObject({ ok: false, error: 'refused', refunded: 1 })
    expect(fake.balance()).toBe(5)
  })

  it('restarts the series when a result is applied (reset), so the next attempt is paid again', async () => {
    const fake = createFakePort({ balance: 5 })
    await attempt(fake.port)
    fake.advance(61_000)
    await attempt(fake.port)
    expect((await readStoreAiStatus(fake.port, 'u1', 'p1', 'k1', 'text')).next.cost).toBe(0)

    await fake.port.resetSeries('p1', 'k1', 'text')
    const status = await readStoreAiStatus(fake.port, 'u1', 'p1', 'k1', 'text')
    expect(status.next).toMatchObject({ attemptNumber: 1, cost: 1 })
  })

  it('keeps separate series per product and per kind', async () => {
    const fake = createFakePort({ balance: 10 })
    await attempt(fake.port)
    fake.advance(61_000)
    const other = await attempt(fake.port, async () => 'ok', { productKey: 'k2' })
    expect(other).toMatchObject({ ok: true, attemptNo: 1, charged: 1 })
    fake.advance(61_000)
    const image = await attempt(fake.port, async () => 'ok', { kind: 'image' })
    expect(image).toMatchObject({ ok: true, attemptNo: 1, charged: STORE_AI_COSTS.image })
  })
})

describe('credits', () => {
  it('never calls the model when credits are insufficient', async () => {
    const fake = createFakePort({ balance: 0 })
    const work = vi.fn(async () => 'ok')
    const result = await attempt(fake.port, work)
    expect(result).toMatchObject({ ok: false, error: 'insufficient_credits' })
    expect(work).not.toHaveBeenCalled()
    expect(fake.ledger).toHaveLength(1)
  })

  it('reflects an admin credit adjustment on the next attempt', async () => {
    const fake = createFakePort({ balance: 0 })
    expect((await attempt(fake.port)).ok).toBe(false)
    fake.ledger.push({ amount: 5, reason: 'admin_adjustment' })
    fake.advance(61_000)
    expect((await attempt(fake.port)).ok).toBe(true)
    expect(fake.balance()).toBe(4)
  })

  it('lets a free attempt run at zero balance', async () => {
    const fake = createFakePort({ balance: 1 })
    await attempt(fake.port)
    fake.advance(61_000)
    expect(fake.balance()).toBe(0)
    expect((await attempt(fake.port)).ok).toBe(true)
  })
})

describe('abuse guards', () => {
  it('runs only one request at a time per user', async () => {
    const fake = createFakePort({ balance: 5 })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const work = vi.fn(async () => {
      await gate
      return 'ok'
    })
    const first = attempt(fake.port, work)
    const second = attempt(fake.port, work)
    const secondResult = await second
    expect(secondResult).toMatchObject({ ok: false, error: 'busy' })
    release()
    expect((await first).ok).toBe(true)
    expect(work).toHaveBeenCalledTimes(1)
    expect(fake.balance()).toBe(4)
  })

  it('does not charge twice for the same request id', async () => {
    const fake = createFakePort({ balance: 5 })
    const work = vi.fn(async () => 'ok')
    const requestId = 'same-request'
    const first = await runMeteredStoreAi(fake.port, { ...base, requestId }, work)
    fake.advance(1_000)
    const again = await runMeteredStoreAi(fake.port, { ...base, requestId }, work)
    expect(first.ok).toBe(true)
    expect(again).toMatchObject({ ok: false, error: 'duplicate_request' })
    expect(work).toHaveBeenCalledTimes(1)
    expect(fake.balance()).toBe(4)
  })

  it('limits requests per minute and then per day', async () => {
    const fake = createFakePort({ balance: 1000 })
    for (let i = 0; i < STORE_AI_LIMITS.perMinute; i += 1) expect((await attempt(fake.port)).ok).toBe(true)
    expect(await attempt(fake.port)).toMatchObject({ ok: false, error: 'rate_limited_minute' })

    // 200 within a rolling day: spread them over the minute window.
    while (fake.attempts.length < STORE_AI_LIMITS.daily) {
      fake.advance(61_000)
      for (let i = 0; i < STORE_AI_LIMITS.perMinute && fake.attempts.length < STORE_AI_LIMITS.daily; i += 1) {
        await attempt(fake.port)
      }
    }
    fake.advance(61_000)
    expect(await attempt(fake.port)).toMatchObject({ ok: false, error: 'rate_limited_daily' })
    fake.advance(86_400_000)
    expect((await attempt(fake.port)).ok).toBe(true)
  })

  it('refunds a charged attempt whose request never finished', async () => {
    const fake = createFakePort({ balance: 5 })
    const stuck = fake.port.begin({ ...base, requestId: req() })
    await stuck
    expect(fake.balance()).toBe(4)
    fake.advance((STORE_AI_LIMITS.staleSeconds + 1) * 1000)
    const next = await attempt(fake.port)
    expect(next).toMatchObject({ ok: true, attemptNo: 1, charged: 1 })
    expect(fake.ledger.some((row) => row.reason.startsWith('store_ai_refund:'))).toBe(true)
    expect(fake.balance()).toBe(4)
  })

  it('refunds when the request is aborted', async () => {
    const fake = createFakePort({ balance: 5 })
    const controller = new AbortController()
    const result = await attempt(
      fake.port,
      async () => {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      },
      { signal: controller.signal },
    )
    expect(result).toMatchObject({ ok: false, error: 'aborted', refunded: 1 })
    expect(fake.balance()).toBe(5)
  })

  it('skips the model call when already aborted', async () => {
    const fake = createFakePort({ balance: 5 })
    const controller = new AbortController()
    controller.abort()
    const work = vi.fn(async () => 'ok')
    const result = await attempt(fake.port, work, { signal: controller.signal })
    expect(result).toMatchObject({ ok: false, error: 'aborted' })
    expect(work).not.toHaveBeenCalled()
    expect(fake.balance()).toBe(5)
  })
})

describe('project isolation', () => {
  it("refuses a key that is another project's product, before any ledger access", async () => {
    const fake = createFakePort({ balance: 5, productOwners: { k1: 'someone-elses-project' } })
    const begin = vi.spyOn(fake.port, 'begin')
    const work = vi.fn(async () => 'ok')
    const result = await attempt(fake.port, work)
    expect(result).toMatchObject({ ok: false, error: 'forbidden_product' })
    expect(begin).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
    expect(fake.balance()).toBe(5)
  })

  it('accepts a key that is this project\'s own product or an unused draft id', async () => {
    const own = createFakePort({ balance: 5, productOwners: { k1: 'p1' } })
    expect((await attempt(own.port)).ok).toBe(true)
    const draft = createFakePort({ balance: 5 })
    expect((await attempt(draft.port)).ok).toBe(true)
  })
})

describe('ledger failures', () => {
  it('fails closed when the ledger is unavailable', async () => {
    const fake = createFakePort({ balance: 5 })
    vi.spyOn(fake.port, 'begin').mockRejectedValue(new Error('db down'))
    const work = vi.fn(async () => 'ok')
    expect(await attempt(fake.port, work)).toMatchObject({ ok: false, error: 'generation_failed', refunded: 0 })
    expect(work).not.toHaveBeenCalled()
  })

  it('retries finish before giving up', async () => {
    const fake = createFakePort({ balance: 5 })
    const realFinish = fake.port.finish
    const finish = vi
      .spyOn(fake.port, 'finish')
      .mockRejectedValueOnce(new Error('blip'))
      .mockImplementation(realFinish)
    expect((await attempt(fake.port)).ok).toBe(true)
    expect(finish).toHaveBeenCalledTimes(2)
    expect(await fake.port.readSucceededCount('p1', 'k1', 'text')).toBe(1)
  })
})
