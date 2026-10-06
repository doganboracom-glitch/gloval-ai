import { describe, expect, it } from 'vitest'
import { toSafeFailureCode } from './failure-code'

describe('toSafeFailureCode', () => {
  it('passes known snake_case codes through', () => {
    expect(toSafeFailureCode(new Error('iyzico_customer_phone_missing'))).toBe('iyzico_customer_phone_missing')
  })

  it('keeps a short sanitized iyzico message', () => {
    expect(toSafeFailureCode(new Error('iyzico_error: Geçersiz telefon numarası'))).toBe(
      'iyzico_error: Geçersiz telefon numarası',
    )
  })

  it('redacts token-like strings and caps length', () => {
    const out = toSafeFailureCode(new Error(`iyzico_error: bad ${'A'.repeat(40)} ${'x '.repeat(100)}`))
    expect(out).not.toContain('AAAA')
    expect(out.length).toBeLessThanOrEqual('iyzico_error: '.length + 80)
  })

  it('maps database errors to their code only', () => {
    expect(toSafeFailureCode({ message: 'duplicate key value ... secret', code: '23505' })).toBe('db_error_23505')
  })

  it('never returns an empty string', () => {
    for (const value of [undefined, null, '', 42, {}, new Error(''), new Error('Some long free text with spaces')]) {
      expect(toSafeFailureCode(value).length).toBeGreaterThan(0)
    }
    expect(toSafeFailureCode(new Error('free text'))).toBe('payment_init_failed')
  })

  it('uses the error class name when there is no usable message', () => {
    expect(toSafeFailureCode(new TypeError(''))).toBe('type_error')
  })
})
