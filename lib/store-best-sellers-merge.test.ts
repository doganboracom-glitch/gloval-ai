import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { selectShowcase } from './store-showcase'

const sql = readFileSync(join(process.cwd(), 'scripts/047-store-collections-best-sellers-merge.sql'), 'utf8')

describe('047 get_store_collections', () => {
  it('merges best sellers with manual members instead of replacing them', () => {
    expect(sql).toMatch(/when c\.auto_best_sellers then \(/)
    expect(sql).toContain('unnest(coalesce((select ids from best)')
    expect(sql).toContain('unnest(coalesce(m.ids')
    expect(sql).toContain('distinct on (z.product_id)')
    expect(sql).toContain('limit 12')
  })

  it('no longer lets best sellers override the manual members', () => {
    expect(sql).not.toMatch(/c\.auto_best_sellers and \(select ids from best\) is not null/)
  })

  it('keeps the signature and grants of 046', () => {
    expect(sql).toContain('create or replace function public.get_store_collections(p_slug text)')
    expect(sql).toContain('grant execute on function public.get_store_collections(text) to anon, authenticated, service_role')
  })
})

describe('selectShowcase with a merged auto collection', () => {
  const catalog = ['ring', 'necklace', 'bracelet'].map((id) => ({ id, price_cents: 1000 }))

  it('shows the best seller plus the manual members, no duplicates', () => {
    const merged = ['ring', 'necklace'] // what the RPC returns: ring sold, necklace is manual
    const result = selectShowcase(catalog, [{ slug: 'ayin-favorisi', product_ids: merged }], {
      collection: 'ayin-favorisi',
      limit: 8,
    })
    expect(result.collection).toBe('ayin-favorisi')
    expect(result.products.map((p) => p.id)).toEqual(['ring', 'necklace'])
  })
})
