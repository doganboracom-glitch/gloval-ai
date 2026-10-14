import { describe, expect, it } from 'vitest'
import {
  buildReturnUrl,
  newReturnNonce,
  nonceMatches,
  verifyReturnParams,
} from '@/lib/store-payments/iyzico-callback'
import { iyzicoReturnPath } from '@/lib/store-payments/iyzico-constants'

const SECRET = 'test-secret'

function paramsOf(url: string) {
  const q = new URL(url).searchParams
  return { o: q.get('o'), n: q.get('n'), s: q.get('s') }
}

describe('return url', () => {
  it('uses the per-store return path', () => {
    expect(iyzicoReturnPath('proj-1')).toBe('/api/store/payment-return/iyzico/proj-1')
    const url = buildReturnUrl('proj-1', 'order-1', newReturnNonce(), SECRET)
    expect(new URL(url).pathname).toBe('/api/store/payment-return/iyzico/proj-1')
  })

  it('verifies its own signature', () => {
    const nonce = newReturnNonce()
    const params = paramsOf(buildReturnUrl('p', 'order-1', nonce, SECRET))
    expect(verifyReturnParams(params, SECRET)).toEqual({ orderId: 'order-1', nonce })
  })

  it('rejects a tampered order id, nonce, signature or secret', () => {
    const nonce = newReturnNonce()
    const params = paramsOf(buildReturnUrl('p', 'order-1', nonce, SECRET))
    expect(verifyReturnParams({ ...params, o: 'order-2' }, SECRET)).toBeNull()
    expect(verifyReturnParams({ ...params, n: 'x' }, SECRET)).toBeNull()
    expect(verifyReturnParams({ ...params, s: 'x' }, SECRET)).toBeNull()
    expect(verifyReturnParams(params, 'other-secret')).toBeNull()
    expect(verifyReturnParams({ o: null, n: null, s: null }, SECRET)).toBeNull()
  })

  it('compares the stored nonce in a replay-safe way', () => {
    expect(nonceMatches('abc', 'abc')).toBe(true)
    expect(nonceMatches('abc', 'abd')).toBe(false)
    expect(nonceMatches(null, 'abc')).toBe(false)
    expect(nonceMatches('', '')).toBe(false)
  })
})
