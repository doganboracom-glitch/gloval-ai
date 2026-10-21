import { describe, expect, it } from 'vitest'
import {
  discardPreview,
  getPreviewState,
  regeneratePreview,
  startPreview,
  usePreview,
  type PreviewDeps,
  type PreviewRow,
  type PreviewStore,
} from '@/lib/ai-preview/service'

const U = 'user-1'
const P = 'project-1'
const S = 'about:0'
const TTL = 30 * 60_000

/**
 * The fake store mirrors the SQL functions of scripts/070-ai-image-previews.sql
 * (the real functions are exercised in a rolled-back transaction against the
 * database): the commit_* methods consume the free right / debit the ledger,
 * write the idempotency record and flip the row in one step.
 */
function setup(opts: { balance?: number; freeUsed?: boolean; generate?: PreviewDeps['generate'] } = {}) {
  let now = 1_000_000
  let seq = 0
  const world = {
    balance: opts.balance ?? 10,
    freeUsed: opts.freeUsed ?? false,
    rows: new Map<string, PreviewRow>(),
    ops: new Set<string>(),
    ledger: [] as { reason: string; amount: number }[],
    removed: [] as string[],
    generated: 0,
    saved: [] as string[],
  }
  const live = (r: PreviewRow) => ['generating', 'open', 'regenerating'].includes(r.status)
  const debit = (amount: number, reason: string) => {
    if (world.balance < amount) return false
    world.balance -= amount
    world.ledger.push({ reason, amount })
    return true
  }

  const store: PreviewStore = {
    freeAvailable: async () => !world.freeUsed,
    findLive: async (userId, projectId, sectionKey) => {
      const r = [...world.rows.values()].find(
        (x) => x.userId === userId && x.projectId === projectId && x.sectionKey === sectionKey && live(x) && x.expiresAt > now,
      )
      return r ? { ...r } : null
    },
    get: async (_u, id) => (world.rows.has(id) ? { ...world.rows.get(id)! } : null),
    claimSlot: async (i) => {
      for (const r of world.rows.values()) {
        if (r.userId === i.userId && r.projectId === i.projectId && r.sectionKey === i.sectionKey && live(r)) {
          if (r.expiresAt < now) r.status = 'expired'
          else return false
        }
      }
      world.rows.set(i.id, {
        id: i.id, userId: i.userId, projectId: i.projectId, sectionKey: i.sectionKey, target: i.target,
        status: 'generating', kind: null, imageUrl: null, storagePath: null, alt: null, imagePrompt: null,
        chargedCredits: 0, regenCount: 0, expiresAt: now + TTL, createdAt: now,
      })
      return true
    },
    commitCreate: async (_u, id, patch) => {
      const r = world.rows.get(id)
      if (!r) return { outcome: 'invalid', kind: null, charged: 0, balance: null }
      if (world.ops.has(`create:${id}`)) return { outcome: 'replay', kind: r.kind, charged: r.chargedCredits, balance: null }
      if (r.status !== 'generating') return { outcome: 'invalid', kind: null, charged: 0, balance: null }
      let kind: 'free' | 'paid' = 'free'
      let charged = 0
      if (world.freeUsed) {
        if (!debit(2, `ai-preview-new:${id}`)) return { outcome: 'no_credits', kind: null, charged: 0, balance: world.balance }
        kind = 'paid'
        charged = 2
      } else {
        world.freeUsed = true
      }
      Object.assign(r, patch, { status: 'open', kind, chargedCredits: charged, expiresAt: now + TTL })
      world.ops.add(`create:${id}`)
      return { outcome: 'ok', kind, charged, balance: world.balance }
    },
    release: async (_u, id, status) => {
      const r = world.rows.get(id)
      if (!r || !live(r)) return null
      r.status = status
      return r.storagePath
    },
    claimRegen: async (_u, id, key) => {
      const r = world.rows.get(id)
      if (!r) return 'invalid'
      if (world.ops.has(`regen:${id}:${key}`)) return 'duplicate'
      if (r.status === 'generating' || r.status === 'regenerating') return 'inflight'
      if (r.status !== 'open' || r.expiresAt <= now) return 'invalid'
      r.status = 'regenerating'
      return 'claimed'
    },
    commitRegen: async (_u, id, key, patch) => {
      const r = world.rows.get(id)
      if (!r) return { outcome: 'invalid', oldPath: null, balance: null }
      if (world.ops.has(`regen:${id}:${key}`)) return { outcome: 'replay', oldPath: null, balance: null }
      if (r.status !== 'regenerating') return { outcome: 'invalid', oldPath: null, balance: null }
      if (!debit(1, `ai-preview-regen:${id}:${key}`)) {
        r.status = 'open'
        return { outcome: 'no_credits', oldPath: null, balance: world.balance }
      }
      const oldPath = r.storagePath
      Object.assign(r, patch, { status: 'open', regenCount: r.regenCount + 1, chargedCredits: r.chargedCredits + 1 })
      world.ops.add(`regen:${id}:${key}`)
      return { outcome: 'ok', oldPath, balance: world.balance }
    },
    releaseRegen: async (_u, id) => {
      const r = world.rows.get(id)
      if (r?.status === 'regenerating') r.status = 'open'
    },
    commitUse: async (_u, id, key) => {
      const r = world.rows.get(id)
      const none = { charged: 0, balance: null, image: null }
      if (!r) return { outcome: 'invalid', ...none }
      const image = { src: r.imageUrl ?? '', alt: r.alt ?? '', imagePrompt: r.imagePrompt ?? '' }
      if (r.status === 'used') return { outcome: 'done', charged: 0, balance: null, image }
      if (r.status !== 'open') return { outcome: 'invalid', ...none }
      if (r.expiresAt <= now) return { outcome: 'expired', ...none }
      const cost = r.kind === 'free' ? 2 : 0
      if (cost > 0 && !debit(cost, `ai-preview-use:${id}`)) {
        return { outcome: 'no_credits', charged: 0, balance: world.balance, image: null }
      }
      r.status = 'used'
      r.chargedCredits += cost
      world.ops.add(`use:${id}:${key}`)
      return { outcome: 'ok', charged: cost, balance: world.balance, image }
    },
  }

  const deps: PreviewDeps = {
    store,
    credits: { balance: async () => world.balance },
    generate:
      opts.generate ??
      (async () => {
        world.generated += 1
        return { image: `data:image/png;base64,AAAA${world.generated}`, alt: 'alt', imagePrompt: 'prompt' }
      }),
    storage: {
      save: async (_u, name) => {
        world.saved.push(name)
        return { url: `https://cdn.test/${name}.png`, path: `previews/${U}/${name}.png` }
      },
      remove: async (paths) => {
        world.removed.push(...paths)
      },
    },
    now: () => now,
    newId: () => `p${++seq}`,
  }
  return { deps, world, advance: (ms: number) => (now += ms) }
}

const start = (deps: PreviewDeps, section = S) =>
  startPreview(deps, { userId: U, projectId: P, sectionKey: section, target: 'about', request: 'x' })

describe('startPreview', () => {
  it('first preview is free: no charge, free right consumed', async () => {
    const { deps, world } = setup()
    const r = await start(deps)
    expect(r).toMatchObject({ ok: true, resumed: false, preview: { kind: 'free', useCost: 2 } })
    expect(world.balance).toBe(10)
    expect(world.freeUsed).toBe(true)
  })

  it('a later preview costs 2 credits', async () => {
    const { deps, world } = setup({ freeUsed: true })
    const r = await start(deps)
    expect(r).toMatchObject({ ok: true, preview: { kind: 'paid', useCost: 0 } })
    expect(world.balance).toBe(8)
  })

  it('without free right or credits nothing is generated, stored or inserted', async () => {
    const { deps, world } = setup({ freeUsed: true, balance: 1 })
    const r = await start(deps)
    expect(r).toEqual({ ok: false, error: 'no_credits', balance: 1 })
    expect(world.generated).toBe(0)
    expect(world.rows.size).toBe(0)
    expect(world.saved).toEqual([])
  })

  it('a failed generation charges nothing and keeps the free right', async () => {
    const { deps, world } = setup({ generate: async () => null })
    expect(await start(deps)).toEqual({ ok: false, error: 'generation_failed' })
    expect(world.freeUsed).toBe(false)
    expect(world.balance).toBe(10)
    expect([...world.rows.values()][0].status).toBe('discarded')
  })

  it('losing the free right to another request at commit time and having no credits discards and deletes the file', async () => {
    const { deps, world } = setup({ balance: 0 })
    const generate = deps.generate
    deps.generate = async (i) => {
      const out = await generate(i)
      world.freeUsed = true
      return out
    }
    const r = await start(deps)
    expect(r).toMatchObject({ ok: false, error: 'no_credits' })
    expect([...world.rows.values()][0].status).toBe('discarded')
    expect(world.removed).toEqual([`previews/${U}/p1-0.png`])
    expect(world.ledger).toEqual([])
  })

  it('a second press resumes the live preview without generating or charging again', async () => {
    const { deps, world } = setup()
    await start(deps)
    const again = await start(deps)
    expect(again).toMatchObject({ ok: true, resumed: true })
    expect(world.generated).toBe(1)
  })

  it('an expired preview no longer resumes; the slot is reclaimed', async () => {
    const { deps, advance } = setup()
    await start(deps)
    advance(TTL + 1000)
    const next = await start(deps)
    expect(next).toMatchObject({ ok: true, resumed: false, preview: { kind: 'paid' } })
  })

  it('an unreadable commit result leaves the row for the sweeper and charges nothing from this side', async () => {
    const { deps } = setup()
    deps.store.commitCreate = async () => {
      throw new Error('network')
    }
    expect(await start(deps)).toEqual({ ok: false, error: 'generation_failed' })
  })
})

describe('regeneratePreview', () => {
  it('costs 1 credit and deletes the replaced image', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    const r = await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k1', request: 'x' })
    expect(r).toMatchObject({ ok: true, preview: { regenCount: 1 } })
    expect(world.balance).toBe(9)
    expect(world.removed).toEqual([`previews/${U}/p1-0.png`])
  })

  it('the same key never charges twice', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k1', request: 'x' })
    const again = await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k1', request: 'x' })
    expect(again.ok).toBe(true)
    expect(world.balance).toBe(9)
    expect(world.generated).toBe(2)
  })

  it('with no credit it never calls the provider and returns the row to open', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    world.balance = 0
    const r = await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k1', request: 'x' })
    expect(r).toMatchObject({ ok: false, error: 'no_credits' })
    expect(world.generated).toBe(1)
    expect(world.rows.get(first.preview.id)!.status).toBe('open')
  })

  it('a failed regeneration charges nothing and keeps the current image', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    deps.generate = async () => null
    const r = await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k1', request: 'x' })
    expect(r).toEqual({ ok: false, error: 'generation_failed' })
    expect(world.balance).toBe(10)
    expect(world.rows.get(first.preview.id)).toMatchObject({ status: 'open', regenCount: 0 })
  })

  it('refuses a second regeneration while one is in flight', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    world.rows.get(first.preview.id)!.status = 'regenerating'
    expect(await regeneratePreview(deps, { userId: U, id: first.preview.id, key: 'k2', request: 'x' })).toEqual({
      ok: false,
      error: 'busy',
    })
  })
})

describe('usePreview', () => {
  it('charges 2 once in a free session, however many times it is sent', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    const a = await usePreview(deps, { userId: U, id: first.preview.id, key: 'u1' })
    const b = await usePreview(deps, { userId: U, id: first.preview.id, key: 'u1' })
    const c = await usePreview(deps, { userId: U, id: first.preview.id, key: 'u2' })
    expect(a).toMatchObject({ ok: true, charged: 2 })
    expect(b).toMatchObject({ ok: true, charged: 0 })
    expect(c).toMatchObject({ ok: true, charged: 0 })
    expect(world.balance).toBe(8)
    expect(world.ledger.filter((l) => l.reason.startsWith('ai-preview-use')).length).toBe(1)
  })

  it('is free in a paid session', async () => {
    const { deps, world } = setup({ freeUsed: true })
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    const r = await usePreview(deps, { userId: U, id: first.preview.id, key: 'u1' })
    expect(r).toMatchObject({ ok: true, charged: 0 })
    expect(world.balance).toBe(8)
  })

  it('refuses a free-session use without credits and keeps the preview open', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    world.balance = 1
    const r = await usePreview(deps, { userId: U, id: first.preview.id, key: 'u1' })
    expect(r).toMatchObject({ ok: false, error: 'no_credits', balance: 1 })
    expect(world.rows.get(first.preview.id)!.status).toBe('open')
  })

  it('refuses an expired preview', async () => {
    const { deps, advance } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    advance(TTL + 1000)
    expect(await usePreview(deps, { userId: U, id: first.preview.id, key: 'u1' })).toEqual({ ok: false, error: 'expired' })
  })
})

describe('discardPreview and state', () => {
  it('discarding is free, deletes the file and never returns the free right', async () => {
    const { deps, world } = setup()
    const first = await start(deps)
    if (!first.ok) throw new Error('setup')
    await discardPreview(deps, { userId: U, id: first.preview.id })
    expect(world.rows.get(first.preview.id)!.status).toBe('discarded')
    expect(world.removed).toEqual([`previews/${U}/p1-0.png`])
    expect(world.freeUsed).toBe(true)
    expect(world.balance).toBe(10)
  })

  it('reports free availability, balance and the open preview', async () => {
    const { deps } = setup()
    expect(await getPreviewState(deps, { userId: U, projectId: P, sectionKey: S })).toMatchObject({
      freeAvailable: true,
      balance: 10,
      preview: null,
    })
    await start(deps)
    const state = await getPreviewState(deps, { userId: U, projectId: P, sectionKey: S })
    expect(state.freeAvailable).toBe(false)
    expect(state.preview).toMatchObject({ kind: 'free' })
  })
})
