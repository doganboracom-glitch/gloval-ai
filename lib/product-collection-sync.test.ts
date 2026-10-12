import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { COLLECTION_SYNC_WARNING, syncProductCollectionsAfterSave } from './product-collection-sync'

describe('syncProductCollectionsAfterSave', () => {
  it('does nothing when the store has no collections or the selection is unchanged', async () => {
    const sync = vi.fn(async () => ({ ok: true }))
    expect(await syncProductCollectionsAfterSave({ hasCollections: false, changed: true, sync })).toEqual({
      attempted: false,
      warning: null,
    })
    expect(await syncProductCollectionsAfterSave({ hasCollections: true, changed: false, sync })).toEqual({
      attempted: false,
      warning: null,
    })
    expect(sync).not.toHaveBeenCalled()
  })

  it('succeeds silently', async () => {
    const result = await syncProductCollectionsAfterSave({
      hasCollections: true,
      changed: true,
      sync: async () => ({ ok: true }),
    })
    expect(result).toEqual({ attempted: true, warning: null })
  })

  it('warns, without throwing, when the step reports failure', async () => {
    const result = await syncProductCollectionsAfterSave({
      hasCollections: true,
      changed: true,
      sync: async () => ({ ok: false }),
    })
    expect(result.warning).toBe(COLLECTION_SYNC_WARNING)
  })

  it('warns, without throwing, when the step itself throws', async () => {
    const result = await syncProductCollectionsAfterSave({
      hasCollections: true,
      changed: true,
      sync: async () => {
        throw new Error('network')
      },
    })
    expect(result.warning).toBe(COLLECTION_SYNC_WARNING)
  })
})

describe('scripts/046 best-seller optimization', () => {
  const sql = readFileSync(join(process.cwd(), 'scripts/046-store-collections-best-sellers-opt.sql'), 'utf8')

  it('only aggregates sales when an auto best-sellers collection exists', () => {
    expect(sql).toMatch(/has_auto as \(\s*select exists/)
    expect(sql).toMatch(/where \(select v from has_auto\)/)
  })

  it('replaces in place (no drop) so existing grants survive, and restates them', () => {
    expect(sql).toMatch(/create or replace function public\.get_store_collections\(p_slug text\)/)
    expect(sql).not.toMatch(/drop function/i)
    expect(sql).toMatch(/revoke all on function public\.get_store_collections\(text\) from public;/)
    expect(sql).toMatch(
      /grant execute on function public\.get_store_collections\(text\) to anon, authenticated, service_role;/,
    )
  })

  it('is idempotent and transactional', () => {
    expect(sql.match(/create index if not exists/g)).toHaveLength(2)
    expect(sql).toMatch(/^begin;$/m)
    expect(sql).toMatch(/^commit;$/m)
  })
})
