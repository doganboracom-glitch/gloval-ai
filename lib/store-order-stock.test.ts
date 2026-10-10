import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { reserveOrderStock } from '@/lib/store-order-stock'

type Admin = Parameters<typeof reserveOrderStock>[0]

function adminWithRpc(rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  return { rpc } as unknown as Admin
}

describe('reserveOrderStock result mapping', () => {
  it('maps a successful atomic reservation', async () => {
    const admin = adminWithRpc(async () => ({ data: { ok: true, already: false }, error: null }))
    expect(await reserveOrderStock(admin, 'o1')).toEqual({ ok: true, mode: 'atomic', already: false })
  })

  it('maps an idempotent repeat', async () => {
    const admin = adminWithRpc(async () => ({ data: { ok: true, already: true }, error: null }))
    expect(await reserveOrderStock(admin, 'o1')).toEqual({ ok: true, mode: 'atomic', already: true })
  })

  it('maps insufficient stock with the offending product', async () => {
    const admin = adminWithRpc(async () => ({
      data: { ok: false, error: 'insufficient_stock', product_id: 'p9' },
      error: null,
    }))
    expect(await reserveOrderStock(admin, 'o1')).toEqual({
      ok: false,
      error: 'insufficient_stock',
      productId: 'p9',
    })
  })

  it('falls back to legacy when the SQL function does not exist yet', async () => {
    const admin = adminWithRpc(async () => ({ data: null, error: { code: '42883', message: 'missing' } }))
    expect(await reserveOrderStock(admin, 'o1')).toEqual({ ok: true, mode: 'legacy' })
  })

  it('fails closed on any other database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const admin = adminWithRpc(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }))
    expect(await reserveOrderStock(admin, 'o1')).toEqual({ ok: false, error: 'stock_failed' })
  })
})

describe('two concurrent checkouts for the last unit', () => {
  it('lets exactly one succeed when the database serializes the reservation', async () => {
    // Models reserve_order_stock: the check and the decrement are one
    // conditional UPDATE, so interleaved callers can never both pass it.
    let stock = 1
    const reserved = new Set<string>()
    const admin = adminWithRpc(async (_name, args) => {
      const orderId = String(args.p_order_id)
      await Promise.resolve()
      if (reserved.has(orderId)) return { data: { ok: true, already: true }, error: null }
      if (stock < 1) {
        return { data: { ok: false, error: 'insufficient_stock', product_id: 'p1' }, error: null }
      }
      stock -= 1
      reserved.add(orderId)
      return { data: { ok: true, already: false }, error: null }
    })

    const [a, b] = await Promise.all([reserveOrderStock(admin, 'order-a'), reserveOrderStock(admin, 'order-b')])
    const successes = [a, b].filter((r) => r.ok)
    expect(successes).toHaveLength(1)
    expect(stock).toBe(0)
  })
})
