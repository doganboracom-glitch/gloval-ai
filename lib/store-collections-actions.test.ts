import { beforeEach, describe, expect, it, vi } from 'vitest'

type DbResult = { data: unknown; error: { code?: string; message?: string } | null }
type Call = { table: string; op: string; filters: Array<[string, unknown]> }

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  respond: (() => ({ data: [], error: null })) as (call: Call) => DbResult,
  authorize: vi.fn(async () => ({ ownerId: 'o', actorId: 'a' })),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))
vi.mock('@/lib/store-payments/owner-auth', () => ({ authorizeProjectOwner: h.authorize }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] }
      h.calls.push(call)
      const builder: Record<string, unknown> = {}
      const chain = (name: string) => (...args: unknown[]) => {
        if (['insert', 'update', 'delete', 'upsert'].includes(name)) call.op = name
        if (name === 'eq' || name === 'in') call.filters.push([String(args[0]), args[1]])
        return builder
      }
      for (const name of ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'upsert']) {
        builder[name] = chain(name)
      }
      builder.single = () => Promise.resolve(h.respond(call))
      builder.maybeSingle = () => Promise.resolve(h.respond(call))
      builder.then = (resolve: (v: DbResult) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(h.respond(call)).then(resolve, reject)
      return builder
    },
  }),
}))

import {
  createCollection,
  listOwnerCollections,
  setProductCollections,
} from './store-collections-actions'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const PRODUCT = '22222222-2222-4222-8222-222222222222'

function happyDb(call: Call): DbResult {
  if (call.table === 'projects') return { data: { slug: 'luna' }, error: null }
  if (call.table === 'ecommerce_collections' && call.op === 'insert') {
    return {
      data: { id: 'c1', name: 'Yaz', slug: 'yaz', sort_order: 0, auto_best_sellers: false },
      error: null,
    }
  }
  if (call.table === 'ecommerce_products') return { data: [{ id: PRODUCT }], error: null }
  return { data: [], error: null }
}

beforeEach(() => {
  h.calls.length = 0
  h.respond = happyDb
  h.authorize.mockReset()
  h.authorize.mockResolvedValue({ ownerId: 'o', actorId: 'a' })
  h.revalidatePath.mockReset()
})

describe('collection actions: authorization', () => {
  it('denies a caller that does not own the project before touching the database', async () => {
    h.authorize.mockRejectedValue(new Error('NOT_FOUND'))
    const result = await createCollection(PROJECT, 'Yaz')
    expect(result).toMatchObject({ ok: false })
    expect(h.calls).toEqual([])
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  it('denies an unauthenticated caller', async () => {
    h.authorize.mockRejectedValue(new Error('UNAUTHENTICATED'))
    const result = await setProductCollections(PROJECT, PRODUCT, [])
    expect(result.ok).toBe(false)
    expect(h.calls).toEqual([])
  })

  it('rejects a malformed project id without running the ownership check', async () => {
    const result = await createCollection('not-a-uuid', 'Yaz')
    expect(result.ok).toBe(false)
    expect(h.authorize).not.toHaveBeenCalled()
    expect(h.calls).toEqual([])
  })

  it('lists nothing for a non-owner', async () => {
    h.authorize.mockRejectedValue(new Error('NOT_FOUND'))
    expect(await listOwnerCollections(PROJECT)).toEqual({ available: false, collections: [] })
    expect(h.calls).toEqual([])
  })
})

describe('collection actions: SQL not applied yet', () => {
  const missing = { code: '42P01', message: 'relation "public.ecommerce_collections" does not exist' }

  it('reports collections as unavailable instead of throwing', async () => {
    h.respond = () => ({ data: null, error: missing })
    expect(await listOwnerCollections(PROJECT)).toEqual({ available: false, collections: [] })
  })

  it('returns a friendly error from mutations and does not revalidate', async () => {
    h.respond = () => ({ data: null, error: missing })
    const result = await createCollection(PROJECT, 'Yaz')
    expect(result).toMatchObject({
      ok: false,
      errors: [{ message: 'Koleksiyonlar henüz etkinleştirilmedi.' }],
    })
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  it('also recognises the PostgREST schema-cache code', async () => {
    h.respond = () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } })
    expect(await listOwnerCollections(PROJECT)).toMatchObject({ available: false })
  })
})

describe('collection actions: project scoping and revalidation', () => {
  it('filters every collection query by project_id', async () => {
    await createCollection(PROJECT, 'Yaz')
    const collectionCalls = h.calls.filter((c) => c.table.startsWith('ecommerce_'))
    expect(collectionCalls.length).toBeGreaterThan(0)
    for (const call of collectionCalls.filter((c) => c.op !== 'insert')) {
      expect(call.filters).toContainEqual(['project_id', PROJECT])
    }
  })

  it('refreshes the editor and the whole storefront tree after a successful change', async () => {
    const result = await createCollection(PROJECT, 'Yaz')
    expect(result.ok).toBe(true)
    expect(h.revalidatePath).toHaveBeenCalledWith(`/ecommerce/${PROJECT}`)
    expect(h.revalidatePath).toHaveBeenCalledWith('/site/luna', 'layout')
  })

  it('refreshes after assigning a product to collections', async () => {
    h.respond = (call) =>
      call.table === 'ecommerce_collections'
        ? {
            data: [{ id: 'c1', name: 'Yaz', slug: 'yaz', sort_order: 0, auto_best_sellers: false }],
            error: null,
          }
        : happyDb(call)
    const result = await setProductCollections(PROJECT, PRODUCT, ['c1'])
    expect(result.ok).toBe(true)
    expect(h.revalidatePath).toHaveBeenCalledWith('/site/luna', 'layout')
  })

  it('does not break a successful change when the slug lookup fails', async () => {
    h.respond = (call) => {
      if (call.table === 'projects') throw new Error('network')
      return happyDb(call)
    }
    const result = await createCollection(PROJECT, 'Yaz')
    expect(result.ok).toBe(true)
  })

  it('does not revalidate when validation fails', async () => {
    const result = await createCollection(PROJECT, '   ')
    expect(result.ok).toBe(false)
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })
})
