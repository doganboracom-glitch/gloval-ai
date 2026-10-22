import { describe, expect, it } from 'vitest'
import { columnsForKind, isSiteKind, siteKindOf, siteTypeBlocker } from '@/lib/site-kind'

describe('siteKindOf / columnsForKind', () => {
  it('round-trips every selectable kind through the column pair', () => {
    for (const kind of ['corporate', 'ecommerce'] as const) {
      expect(siteKindOf(columnsForKind(kind))).toBe(kind)
    }
  })

  it('keeps project_type and commerce_mode consistent', () => {
    expect(columnsForKind('corporate')).toEqual({ project_type: 'corporate', commerce_mode: 'none' })
    expect(columnsForKind('ecommerce')).toEqual({ project_type: 'ecommerce', commerce_mode: 'ecommerce' })
  })

  it('reads an existing catalog row as catalog without ever writing it', () => {
    expect(siteKindOf({ project_type: 'corporate', commerce_mode: 'catalog' })).toBe('catalog')
    expect(siteKindOf({ project_type: 'ecommerce', commerce_mode: 'catalog' })).toBe('catalog')
  })

  it('validates unknown input', () => {
    expect(isSiteKind('catalog')).toBe(false)
    expect(isSiteKind('ecommerce')).toBe(true)
    expect(isSiteKind('store')).toBe(false)
    expect(isSiteKind(undefined)).toBe(false)
  })
})

describe('siteTypeBlocker', () => {
  const empty = { products: 0, orders: 0 }

  it('never blocks a no-op', () => {
    expect(siteTypeBlocker('ecommerce', 'ecommerce', { products: 4, orders: 2 })).toBeNull()
  })

  it('refuses corporate while products or orders exist', () => {
    expect(siteTypeBlocker('ecommerce', 'corporate', { products: 1, orders: 0 })).toBe('has_store_data')
    expect(siteTypeBlocker('catalog', 'corporate', { products: 0, orders: 1 })).toBe('has_store_data')
    expect(siteTypeBlocker('ecommerce', 'corporate', empty)).toBeNull()
  })

  it('refuses catalog while orders exist but allows it with only products', () => {
    expect(siteTypeBlocker('ecommerce', 'catalog', { products: 3, orders: 1 })).toBe('has_orders')
    expect(siteTypeBlocker('ecommerce', 'catalog', { products: 3, orders: 0 })).toBeNull()
  })

  it('allows promoting a corporate site to a store', () => {
    expect(siteTypeBlocker('corporate', 'ecommerce', empty)).toBeNull()
    expect(siteTypeBlocker('corporate', 'catalog', empty)).toBeNull()
  })
})
