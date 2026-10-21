import { describe, expect, it } from 'vitest'
import { describePanel, PREVIEW_COSTS } from './policy'
import {
  discardPreview,
  getPreviewState,
  regeneratePreview,
  startPreview,
  usePreview,
  type PreviewDeps,
  type PreviewRow,
  type PreviewStore,
} from './service'

const USER = 'u1'
const START = { userId: USER, projectId: 'p1', sectionKey: 'about:0', target: 'Kahve', request: 'req' }

function makeWorld(opts: { balance?: number; free?: boolean; generateOk?: () => boolean } = {}) {
  let balance = opts.balance ?? 10
  let free = opts.free ?? true
  let clock = 1_000
  let seq = 0
  const rows = new Map<string, PreviewRow>()
  const ledger = new Set<string>()
  const removed: string[] = []
  const usedRegenKeys = new Map<string, string>()

  const store: PreviewStore = {
    hasFreeEntitlement: async () => free,
    consumeFreeEntitlement: async () => {
      if (!free) return false
      free = false
      return true
    },
    findLive: async (u, p, s, now) => {
      for (const r of rows.values()) {
        if (r.userId === u && r.projectId === p && r.sectionKey === s && ['generating', 'open', 'regenerating', 'using'].includes(r.status)) {
          if (r.expiresAt <= now) r.status = 'expired'
          else return r
        }
      }
      return null
    },
    get: async (_u, id) => rows.get(id) ?? null,
    claimSlot: async (i, now) => {
      for (const r of rows.values()) {
        if (r.userId === i.userId && r.projectId === i.projectId && r.sectionKey === i.sectionKey && ['generating', 'open', 'regenerating', 'using'].includes(r.status) && r.expiresAt > now) {
          return { claimed: false }
        }
      }
      rows.set(i.id, {
        id: i.id, userId: i.userId, projectId: i.projectId, sectionKey: i.sectionKey, target: i.target,
        status: 'generating', kind: null, imageUrl: null, storagePath: null, alt: null, imagePrompt: null,
        chargedCredits: 0, regenCount: 0, lastRegenKey: null, useKey: null, expiresAt: now + 30 * 60_000, createdAt: now,
      })
      return { claimed: true }
    },
    completeCreate: async (id, _u, patch) => {
      const r = rows.get(id)!
      Object.assign(r, { ...patch, status: 'open' })
    },
    release: async (id, _u, status) => {
      rows.get(id)!.status = status
    },
    claimRegen: async (id, _u, key) => {
      const r = rows.get(id)
      if (!r) return 'invalid'
      if (r.lastRegenKey === key) return 'duplicate'
      if (r.status === 'regenerating') return 'inflight'
      if (r.status !== 'open') return 'invalid'
      r.status = 'regenerating'
      usedRegenKeys.set(id, key)
      return 'claimed'
    },
    completeRegen: async (id, _u, patch) => {
      const r = rows.get(id)!
      Object.assign(r, patch, { status: 'open', regenCount: r.regenCount + 1, lastRegenKey: usedRegenKeys.get(id) ?? null })
    },
    revertRegen: async (id) => {
      rows.get(id)!.status = 'open'
    },
    claimUse: async (id, _u, key) => {
      const r = rows.get(id)
      if (!r) return 'invalid'
      if (r.status === 'used') return 'done'
      if (r.status === 'using') return 'inflight'
      if (r.status !== 'open') return 'invalid'
      r.status = 'using'
      r.useKey = key
      return 'claimed'
    },
    completeUse: async (id) => {
      rows.get(id)!.status = 'used'
    },
    revertUse: async (id) => {
      rows.get(id)!.status = 'open'
    },
  }

  const deps: PreviewDeps = {
    store,
    credits: {
      balance: async () => balance,
      consume: async (_u, amount, reason) => {
        if (balance < amount) return { ok: false, balance }
        balance -= amount
        ledger.add(reason)
        return { ok: true, balance }
      },
      charged: async (_u, reason) => ledger.has(reason),
    },
    generate: async () =>
      (opts.generateOk ? opts.generateOk() : true) ? { image: 'data:image/png;base64,AAAA', alt: 'Kahve tezgahı', imagePrompt: 'p' } : null,
    storage: {
      save: async (_u, name) => ({ url: `https://cdn.test/${name}.png`, path: `ai/${name}.png` }),
      remove: async (paths) => {
        removed.push(...paths)
      },
    },
    now: () => clock,
    newId: () => `pv${++seq}`,
  }

  return {
    deps, rows, removed,
    balance: () => balance,
    freeLeft: () => free,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe('describePanel (UI cost display)', () => {
  it('shows the first preview as free and the following as 2 credits', () => {
    expect(describePanel({ freeAvailable: true, balance: 0 }).start).toMatchObject({ cost: 0, free: true, enabled: true })
    expect(describePanel({ freeAvailable: false, balance: 5 }).start).toMatchObject({ cost: 2, free: false, enabled: true })
  })
  it('disables actions with a reason when credits are short', () => {
    const s = describePanel({ freeAvailable: false, balance: 1, preview: { kind: 'paid' } })
    expect(s.start).toMatchObject({ enabled: false, reason: 'no-credits' })
    expect(s.regenerate).toMatchObject({ cost: 1, enabled: true })
    expect(s.use).toMatchObject({ cost: 0, enabled: true })
    const free = describePanel({ freeAvailable: false, balance: 1, preview: { kind: 'free' } })
    expect(free.use).toMatchObject({ cost: PREVIEW_COSTS.useFree, enabled: false })
  })
})

describe('free preview session', () => {
  it('generates free, consumes the account entitlement, charges 2 only on use', async () => {
    const w = makeWorld()
    const r = await startPreview(w.deps, START)
    expect(r.ok && r.preview.kind).toBe('free')
    expect(w.balance()).toBe(10)
    expect(w.freeLeft()).toBe(false)
    const id = (r as { preview: { id: string } }).preview.id
    const used = await usePreview(w.deps, { userId: USER, id, key: 'k1' })
    expect(used).toMatchObject({ ok: true, charged: 2 })
    expect(w.balance()).toBe(8)
  })

  it('never charges twice for the same use key or a repeated use', async () => {
    const w = makeWorld()
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    await usePreview(w.deps, { userId: USER, id, key: 'k1' })
    const again = await usePreview(w.deps, { userId: USER, id, key: 'k1' })
    expect(again).toMatchObject({ ok: true, charged: 0 })
    expect(w.balance()).toBe(8)
  })

  it('closing a free preview is free and does not give the free preview back', async () => {
    const w = makeWorld()
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    await discardPreview(w.deps, { userId: USER, id })
    expect(w.balance()).toBe(10)
    expect(w.freeLeft()).toBe(false)
    expect(w.removed.length).toBe(1)
    const next = await startPreview(w.deps, START)
    expect(next.ok && next.preview.kind).toBe('paid')
    expect(w.balance()).toBe(8)
  })

  it('refuses "Kullan" without credits and keeps the preview open', async () => {
    const w = makeWorld({ balance: 1 })
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    const used = await usePreview(w.deps, { userId: USER, id, key: 'k1' })
    expect(used).toMatchObject({ ok: false, error: 'no_credits' })
    expect(w.rows.get(id)!.status).toBe('open')
    expect(w.balance()).toBe(1)
  })
})

describe('paid session', () => {
  it('charges 2 at creation and nothing on use', async () => {
    const w = makeWorld({ free: false })
    const r = await startPreview(w.deps, START)
    expect(r.ok && r.preview.kind).toBe('paid')
    expect(w.balance()).toBe(8)
    const id = (r as { preview: { id: string } }).preview.id
    expect(await usePreview(w.deps, { userId: USER, id, key: 'k1' })).toMatchObject({ ok: true, charged: 0 })
    expect(w.balance()).toBe(8)
  })

  it('does not start without 2 credits', async () => {
    const w = makeWorld({ free: false, balance: 1 })
    expect(await startPreview(w.deps, START)).toMatchObject({ ok: false, error: 'no_credits' })
    expect(w.rows.size).toBe(0)
  })
})

describe('failed generation', () => {
  it('charges nothing and keeps the free preview', async () => {
    const w = makeWorld({ generateOk: () => false })
    expect(await startPreview(w.deps, START)).toMatchObject({ ok: false, error: 'generation_failed' })
    expect(w.balance()).toBe(10)
    expect(w.freeLeft()).toBe(true)
    expect([...w.rows.values()].every((r) => r.status === 'discarded')).toBe(true)
  })
})

describe('regenerate', () => {
  it('costs 1 per press, once per key', async () => {
    const w = makeWorld()
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    const a = await regeneratePreview(w.deps, { userId: USER, id, key: 'r1', request: 'x' })
    expect(a.ok).toBe(true)
    expect(w.balance()).toBe(9)
    const replay = await regeneratePreview(w.deps, { userId: USER, id, key: 'r1', request: 'x' })
    expect(replay.ok).toBe(true)
    expect(w.balance()).toBe(9)
    await regeneratePreview(w.deps, { userId: USER, id, key: 'r2', request: 'x' })
    expect(w.balance()).toBe(8)
  })

  it('does not charge when generation fails', async () => {
    let ok = true
    const w = makeWorld({ generateOk: () => ok })
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    ok = false
    expect(await regeneratePreview(w.deps, { userId: USER, id, key: 'r1', request: 'x' })).toMatchObject({ ok: false, error: 'generation_failed' })
    expect(w.balance()).toBe(10)
    expect(w.rows.get(id)!.status).toBe('open')
  })

  it('refuses without credits', async () => {
    const w = makeWorld({ balance: 0 })
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    expect(await regeneratePreview(w.deps, { userId: USER, id, key: 'r1', request: 'x' })).toMatchObject({ ok: false, error: 'no_credits' })
  })
})

describe('recovery and expiry', () => {
  it('returns the same live preview on a second start or refresh without charging', async () => {
    const w = makeWorld({ free: false })
    const first = await startPreview(w.deps, START)
    const second = await startPreview(w.deps, START)
    expect(second).toMatchObject({ ok: true, resumed: true })
    expect((second as { preview: { id: string } }).preview.id).toBe((first as { preview: { id: string } }).preview.id)
    expect(w.balance()).toBe(8)
    const state = await getPreviewState(w.deps, { userId: USER, projectId: 'p1', sectionKey: 'about:0' })
    expect(state.preview?.id).toBe((first as { preview: { id: string } }).preview.id)
  })

  it('drops the preview after the 30 minute TTL', async () => {
    const w = makeWorld()
    const r = await startPreview(w.deps, START)
    const id = (r as { preview: { id: string } }).preview.id
    w.advance(31 * 60_000)
    const state = await getPreviewState(w.deps, { userId: USER, projectId: 'p1', sectionKey: 'about:0' })
    expect(state.preview).toBeNull()
    expect(await usePreview(w.deps, { userId: USER, id, key: 'k' })).toMatchObject({ ok: false })
    expect(w.balance()).toBe(10)
  })
})
