import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCoverGeneration, type CoverRunDeps, type CoverRunInput } from '@/lib/blog-cover-run'
import type { CoverVerdict } from '@/lib/blog-cover'

const clean: CoverVerdict = { text: 'clean', people: 'clean' }

/** A fake credit ledger + image client: the only way to lose credits is `charge`. */
function harness(overrides: Partial<CoverRunDeps> = {}) {
  const ledger = { balance: 10, charges: [] as Array<{ amount: number; reason: string }> }
  const deps: CoverRunDeps = {
    getBalance: async () => ledger.balance,
    concepts: async () => 'a lightbulb, a key, a network of connected nodes',
    generate: async () => ({ src: 'data:image/png;base64,AAAA' }),
    inspect: async () => clean,
    persist: async () => 'https://cdn.example/cover.png',
    charge: async (amount, reason) => {
      ledger.charges.push({ amount, reason })
      ledger.balance -= amount
      return { ok: true, balance: ledger.balance }
    },
    ...overrides,
  }
  return { ledger, deps }
}

const input = (extra: Partial<CoverRunInput> = {}): CoverRunInput => ({
  title: 'Yapay zeka ve güven',
  excerpt: '',
  style: 'flat',
  colors: ['blue'],
  cost: 2,
  reason: 'blogCover:req-12345678',
  ...extra,
})

describe('runCoverGeneration credit rule', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('charges exactly once for an accepted, stored image', async () => {
    const { ledger, deps } = harness()
    const result = await runCoverGeneration(deps, input())
    expect(result).toMatchObject({ ok: true, url: 'https://cdn.example/cover.png', charged: 2, balance: 8 })
    expect(ledger.charges).toEqual([{ amount: 2, reason: 'blogCover:req-12345678' }])
  })

  it('does not charge when the model keeps failing (throws or returns nothing)', async () => {
    for (const generate of [
      () => Promise.reject(new Error('model down')),
      async () => null,
    ]) {
      const { ledger, deps } = harness({ generate })
      const result = await runCoverGeneration(deps, input())
      expect(result).toMatchObject({ ok: false, error: 'generation_failed', charged: 0, balance: 10 })
      expect(ledger.charges).toHaveLength(0)
      expect(ledger.balance).toBe(10)
    }
  })

  it('does not charge when the quality gate rejects both attempts', async () => {
    const { ledger, deps } = harness({ inspect: async () => ({ text: 'text', people: 'clean' }) })
    const result = await runCoverGeneration(deps, input())
    expect(result).toMatchObject({ ok: false, error: 'rejected', charged: 0 })
    expect(ledger.charges).toHaveLength(0)
  })

  it('does not charge when storage fails (throws or returns a non-URL)', async () => {
    for (const persist of [() => Promise.reject(new Error('blob down')), async () => 'data:image/png;base64,AAAA']) {
      const { ledger, deps } = harness({ persist })
      const result = await runCoverGeneration(deps, input())
      expect(result).toMatchObject({ ok: false, error: 'storage_failed', charged: 0 })
      expect(ledger.charges).toHaveLength(0)
    }
  })

  it('does not charge when an attempt hangs past the timeout', async () => {
    const { ledger, deps } = harness({ generate: () => new Promise(() => undefined) })
    const pending = runCoverGeneration(deps, input({ attemptTimeoutMs: 1_000, budgetMs: 100_000 }))
    await vi.advanceTimersByTimeAsync(2_500)
    const result = await pending
    expect(result).toMatchObject({ ok: false, error: 'generation_failed', charged: 0 })
    expect(ledger.charges).toHaveLength(0)
  })

  it('does not charge when the overall budget runs out, even if the image arrives late', async () => {
    let release!: (value: { src: string }) => void
    const { ledger, deps } = harness({ generate: () => new Promise((resolve) => (release = resolve)) })
    const pending = runCoverGeneration(deps, input({ budgetMs: 5_000, attemptTimeoutMs: 60_000 }))
    await vi.advanceTimersByTimeAsync(5_001)
    const result = await pending
    expect(result).toMatchObject({ ok: false, error: 'timeout', status: 504, charged: 0 })
    release({ src: 'data:image/png;base64,AAAA' })
    await vi.advanceTimersByTimeAsync(10)
    expect(ledger.charges).toHaveLength(0)
    expect(ledger.balance).toBe(10)
  })

  it('does not charge when the client has gone away', async () => {
    const controller = new AbortController()
    let release!: (value: { src: string }) => void
    const { ledger, deps } = harness({ generate: () => new Promise((resolve) => (release = resolve)) })
    const pending = runCoverGeneration(deps, input({ signal: controller.signal }))
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    expect(await pending).toMatchObject({ ok: false, error: 'aborted', charged: 0 })
    release({ src: 'data:image/png;base64,AAAA' })
    await vi.advanceTimersByTimeAsync(10)
    expect(ledger.charges).toHaveLength(0)
  })

  it('stops before generating when the balance is too low', async () => {
    const generate = vi.fn()
    const { ledger, deps } = harness({ getBalance: async () => 1, generate })
    const result = await runCoverGeneration(deps, input())
    expect(result).toMatchObject({ ok: false, error: 'out_of_credits', status: 402, charged: 0 })
    expect(generate).not.toHaveBeenCalled()
    expect(ledger.charges).toHaveLength(0)
  })

  it('reports no charge when the ledger refuses it after generation', async () => {
    const { deps } = harness({ charge: async () => ({ ok: false, balance: 1 }) })
    const result = await runCoverGeneration(deps, input())
    expect(result).toMatchObject({ ok: false, error: 'out_of_credits', charged: 0, balance: 1 })
  })

  it('recovers when the first image is rejected and the second is clean', async () => {
    const srcs = ['bad', 'good']
    const { ledger, deps } = harness({
      generate: async () => ({ src: srcs.shift() as string }),
      inspect: async (src) => (src === 'bad' ? { text: 'text', people: 'clean' } : clean),
    })
    const result = await runCoverGeneration(deps, input())
    expect(result).toMatchObject({ ok: true, attempts: 2 })
    expect(ledger.charges).toHaveLength(1)
  })
})
