import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  closeForUser: vi.fn(async () => 'abandoned' as const),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('./reconcile-store', () => ({ closePendingCheckoutForUser: h.closeForUser }))

import { closePendingCheckout } from './close-checkout-actions'

beforeEach(() => {
  h.closeForUser.mockClear()
  h.user = null
})

describe('closePendingCheckout (server action)', () => {
  it('does nothing for a signed-out caller', async () => {
    expect(await closePendingCheckout(Date.now())).toBe('none')
    expect(h.closeForUser).not.toHaveBeenCalled()
  })

  it('always acts as the signed-in user; the client cannot choose whose record is closed', async () => {
    h.user = { id: 'user_a' }
    await closePendingCheckout(Date.now())
    expect(h.closeForUser).toHaveBeenCalledTimes(1)
    expect(h.closeForUser).toHaveBeenCalledWith('user_a', expect.any(Number))
    expect(closePendingCheckout.length).toBe(1)
  })
})
