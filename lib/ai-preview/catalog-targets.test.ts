import { describe, expect, it } from 'vitest'
import {
  DB_PREVIEW_TARGETS,
  PREVIEW_COSTS,
  SUPPORTED_TARGETS,
  describePanel,
  previewDbTarget,
  useCost,
} from '@/lib/ai-preview/policy'
import { startPreview, regeneratePreview, usePreview, type PreviewDeps, type PreviewRow } from '@/lib/ai-preview/service'

describe('preview target vs live CHECK constraint', () => {
  it('every supported target persists as a value the live constraint accepts', () => {
    for (const target of SUPPORTED_TARGETS) {
      expect(DB_PREVIEW_TARGETS).toContain(previewDbTarget(target))
    }
  })

  it('catalog targets use gallery; about/services are unchanged', () => {
    expect(previewDbTarget('productsbanner')).toBe('gallery')
    expect(previewDbTarget('products')).toBe('gallery')
    expect(previewDbTarget('about')).toBe('about')
    expect(previewDbTarget('services')).toBe('services')
  })
})

describe('banner credit rules (shared preview service)', () => {
  const rule = (freeUsed: boolean) => {
    let balance = 10
    const rows = new Map<string, PreviewRow>()
    const insertedTargets: string[] = []
    const generatedFor: string[] = []
    const deps = {
      store: {
        freeAvailable: async () => !freeUsed,
        findLive: async () => null,
        get: async (_u: string, id: string) => rows.get(id) ?? null,
        claimSlot: async (i: { id: string; userId: string; projectId: string; sectionKey: string; target: string }) => {
          insertedTargets.push(i.target)
          rows.set(i.id, {
            id: i.id, userId: i.userId, projectId: i.projectId, sectionKey: i.sectionKey, target: i.target,
            status: 'generating', kind: null, imageUrl: null, storagePath: null, alt: null, imagePrompt: null,
            chargedCredits: 0, regenCount: 0, expiresAt: Date.now() + 1e6, createdAt: Date.now(),
          })
          return true
        },
        commitCreate: async (_u: string, id: string, patch: object) => {
          const r = rows.get(id)!
          const kind = freeUsed ? 'paid' : 'free'
          if (freeUsed) balance -= PREVIEW_COSTS.newPreview
          Object.assign(r, patch, { status: 'open', kind })
          return { outcome: 'ok', kind, charged: freeUsed ? 2 : 0, balance }
        },
        release: async () => null,
        claimRegen: async () => 'claimed',
        commitRegen: async (_u: string, id: string, _k: string, patch: object) => {
          balance -= PREVIEW_COSTS.regenerate
          Object.assign(rows.get(id)!, patch)
          return { outcome: 'ok', oldPath: null, balance }
        },
        releaseRegen: async () => undefined,
        commitUse: async (_u: string, id: string) => {
          const r = rows.get(id)!
          const cost = useCost(r.kind!)
          balance -= cost
          return { outcome: 'ok', charged: cost, balance, image: { src: r.imageUrl!, alt: '', imagePrompt: '' } }
        },
      },
      credits: { balance: async () => balance },
      generate: async ({ sectionKey }: { sectionKey: string }) => {
        generatedFor.push(sectionKey)
        return { image: 'data:image/png;base64,AAAA', alt: 'banner', imagePrompt: 'p' }
      },
      storage: {
        save: async (_u: string, name: string) => ({ url: `https://cdn.test/${name}.png`, path: name }),
        remove: async () => undefined,
      },
      now: () => Date.now(),
      newId: () => 'b1',
    } as unknown as PreviewDeps
    return { deps, balance: () => balance, insertedTargets, generatedFor }
  }

  const input = { userId: 'u', projectId: 'p', sectionKey: 'productsbanner:2', target: previewDbTarget('productsbanner'), request: '' }

  it('first preview is free; Kullan then costs 2', async () => {
    const w = rule(false)
    const started = await startPreview(w.deps, input)
    expect(started).toMatchObject({ ok: true, preview: { kind: 'free', useCost: 2 } })
    expect(w.balance()).toBe(10)
    expect(w.insertedTargets).toEqual(['gallery'])
    expect(w.generatedFor).toEqual(['productsbanner:2'])
    const used = await usePreview(w.deps, { userId: 'u', id: 'b1', key: 'k' })
    expect(used).toMatchObject({ ok: true, charged: 2 })
    expect(w.balance()).toBe(8)
  })

  it('after the free right: new preview costs 2, Kullan is free, regenerate costs 1', async () => {
    const w = rule(true)
    const started = await startPreview(w.deps, input)
    expect(started).toMatchObject({ ok: true, preview: { kind: 'paid', useCost: 0 } })
    expect(w.balance()).toBe(8)
    await regeneratePreview(w.deps, { userId: 'u', id: 'b1', key: 'r1', request: '' })
    expect(w.balance()).toBe(7)
    const used = await usePreview(w.deps, { userId: 'u', id: 'b1', key: 'k' })
    expect(used).toMatchObject({ ok: true, charged: 0 })
    expect(w.balance()).toBe(7)
  })

  it('panel labels: start shows free, then 2 credits', () => {
    expect(describePanel({ freeAvailable: true, balance: 0 }).start).toMatchObject({ cost: 0, free: true, enabled: true })
    expect(describePanel({ freeAvailable: false, balance: 5 }).start).toMatchObject({ cost: 2, free: false })
  })
})
