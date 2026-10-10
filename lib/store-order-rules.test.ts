import { describe, expect, it } from 'vitest'
import { buildOrderLines, parseOrderQuantity, type OrderProductRow } from '@/lib/store-order-rules'

function product(overrides: Partial<OrderProductRow> = {}): OrderProductRow {
  return {
    id: 'p1',
    name: 'Mug',
    price_cents: 1000,
    currency: 'TRY',
    stock: 10,
    status: 'active',
    track_stock: true,
    ...overrides,
  }
}

function build(items: { productId: unknown; quantity: unknown }[], ...products: OrderProductRow[]) {
  return buildOrderLines(items, new Map(products.map((p) => [p.id, p])))
}

describe('parseOrderQuantity', () => {
  it.each([[1], [99], ['5']])('accepts %s', (value) => {
    expect(parseOrderQuantity(value)).toBe(Number(value))
  })

  it.each([[1.5], ['1.5'], [0], [-1], [100], [NaN], [Infinity], [''], ['abc'], [null], [undefined]])(
    'rejects %s',
    (value) => {
      expect(parseOrderQuantity(value)).toBeNull()
    },
  )
})

describe('buildOrderLines', () => {
  it('prices lines from the authoritative product row', () => {
    const res = build([{ productId: 'p1', quantity: 3 }], product())
    expect(res).toMatchObject({ ok: true, subtotalCents: 3000, currency: 'TRY', totalItems: 3 })
  })

  it.each([[0], [-500]])('rejects a product priced %s', (price) => {
    const res = build([{ productId: 'p1', quantity: 1 }], product({ price_cents: price }))
    expect(res).toMatchObject({ ok: false, error: 'product_not_purchasable' })
  })

  it('rejects a fractional quantity instead of rounding it', () => {
    const res = build([{ productId: 'p1', quantity: 1.5 }], product())
    expect(res).toMatchObject({ ok: false, error: 'invalid_quantity' })
  })

  it('rejects a negative quantity', () => {
    const res = build([{ productId: 'p1', quantity: -2 }], product())
    expect(res).toMatchObject({ ok: false, error: 'invalid_quantity' })
  })

  it('rejects a mixed-currency cart', () => {
    const res = build(
      [
        { productId: 'p1', quantity: 1 },
        { productId: 'p2', quantity: 1 },
      ],
      product(),
      product({ id: 'p2', currency: 'USD' }),
    )
    expect(res).toMatchObject({ ok: false, error: 'mixed_currency' })
  })

  it.each(['archived', 'draft'])('rejects a %s product', (status) => {
    const res = build([{ productId: 'p1', quantity: 1 }], product({ status }))
    expect(res).toMatchObject({ ok: false, error: 'product_unavailable' })
  })

  it('rejects an unknown product', () => {
    const res = build([{ productId: 'ghost', quantity: 1 }], product())
    expect(res).toMatchObject({ ok: false, error: 'invalid_items' })
  })

  it('rejects an empty cart', () => {
    expect(build([], product())).toMatchObject({ ok: false, error: 'invalid_items' })
  })

  it('reports insufficient stock for a tracked product', () => {
    const res = build([{ productId: 'p1', quantity: 5 }], product({ stock: 2 }))
    expect(res).toMatchObject({ ok: false, error: 'insufficient_stock', available: 2 })
  })

  it('does not check stock when tracking is off', () => {
    const res = build([{ productId: 'p1', quantity: 5 }], product({ stock: 0, track_stock: false }))
    expect(res.ok).toBe(true)
  })

  it('merges duplicate lines before applying the per-line limit', () => {
    const res = build(
      [
        { productId: 'p1', quantity: 60 },
        { productId: 'p1', quantity: 60 },
      ],
      product({ stock: 500 }),
    )
    expect(res).toMatchObject({ ok: false, error: 'quantity_too_high' })
  })
})
