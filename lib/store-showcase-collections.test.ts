import { describe, expect, it } from 'vitest'
import { selectShowcase, showcaseEditorState } from './store-showcase'

const product = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  price_cents: 1000,
  ...extra,
})
const catalog = ['a', 'b', 'c', 'd', 'e'].map((id) => product(id))

describe('selectShowcase', () => {
  it('shows a bound collection in owner order, capped by the limit', () => {
    const result = selectShowcase(catalog, [{ slug: 'yaz', product_ids: ['c', 'a', 'e', 'b', 'd'] }], {
      collection: 'yaz',
      limit: 4,
    })
    expect(result.collection).toBe('yaz')
    expect(result.products.map((p) => p.id)).toEqual(['c', 'a', 'e', 'b'])
  })

  it('skips members that are no longer in the catalog', () => {
    const result = selectShowcase(catalog, [{ slug: 'yaz', product_ids: ['gone', 'b'] }], {
      collection: 'yaz',
    })
    expect(result.products.map((p) => p.id)).toEqual(['b'])
  })

  it('falls back to the newest products when the collection was deleted', () => {
    const result = selectShowcase(catalog, [], { collection: 'silinmis', limit: 4 })
    expect(result.collection).toBeNull()
    expect(result.products.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('falls back to the newest products when the collection is empty', () => {
    const result = selectShowcase(catalog, [{ slug: 'yaz', product_ids: [] }], { collection: 'yaz' })
    expect(result.collection).toBeNull()
    expect(result.products).toHaveLength(4)
  })

  it('ignores the saved source while bound, even when it would filter everything out', () => {
    const result = selectShowcase(catalog, [], { collection: 'silinmis', source: 'sale' })
    expect(result.products).toHaveLength(4)
  })

  it('still honours the source for unbound sections', () => {
    const withSale = [product('a'), product('b', { compare_at_price_cents: 2000 })]
    expect(selectShowcase(withSale, undefined, { source: 'sale' }).products.map((p) => p.id)).toEqual(['b'])
  })

  it('treats an unusable slug as unbound', () => {
    const result = selectShowcase(catalog, [{ slug: 'x', product_ids: ['a'] }], {
      collection: '../etc',
      source: 'latest',
    })
    expect(result.collection).toBeNull()
  })

  it('works when the collections RPC returned nothing (undefined)', () => {
    expect(selectShowcase(catalog, undefined, { collection: 'yaz' }).products).toHaveLength(4)
  })
})

describe('showcaseEditorState', () => {
  it('hides the picker for an unbound section in a store without collections', () => {
    expect(showcaseEditorState({}, [])).toEqual({
      boundSlug: null,
      boundMissing: false,
      showPicker: false,
      sourceDisabled: false,
    })
  })

  it('shows the picker once collections exist and keeps the source editable while unbound', () => {
    const state = showcaseEditorState({}, [{ slug: 'yaz' }])
    expect(state.showPicker).toBe(true)
    expect(state.sourceDisabled).toBe(false)
  })

  it('locks the source field while bound to an existing collection', () => {
    const state = showcaseEditorState({ collection: 'yaz' }, [{ slug: 'yaz' }])
    expect(state).toMatchObject({ boundSlug: 'yaz', boundMissing: false, sourceDisabled: true })
  })

  it('flags a bound collection that no longer exists but keeps the picker so it can be cleared', () => {
    const state = showcaseEditorState({ collection: 'silinmis' }, [])
    expect(state).toMatchObject({ boundMissing: true, showPicker: true, sourceDisabled: true })
  })
})
