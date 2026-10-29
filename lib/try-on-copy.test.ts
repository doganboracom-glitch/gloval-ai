import { describe, expect, it } from 'vitest'
import { TRY_ON_COPY, tryOnErrorMessage } from './try-on-copy'

describe.each(['tr', 'en'] as const)('tryOnErrorMessage (%s)', (lang) => {
  const copy = TRY_ON_COPY[lang]

  it('maps the platform 413 (non-JSON body, no error code) to the too-large message', () => {
    expect(tryOnErrorMessage(copy, 413)).toBe(copy.errorTooLarge)
    expect(tryOnErrorMessage(copy, 413, 'failed')).toBe(copy.errorTooLarge)
  })

  it('maps invalid_photo to the photo type message, not the generic fallback', () => {
    const message = tryOnErrorMessage(copy, 400, 'invalid_photo')
    expect(message).toBe(copy.errorType)
    expect(message).not.toBe(copy.errorGeneric.default)
  })

  it.each(['unavailable', 'failed', 'rate_limited', 'not_available'] as const)('maps %s to its own message', (code) => {
    expect(tryOnErrorMessage(copy, 500, code)).toBe(copy.errorGeneric[code])
  })

  it('falls back to the default message for unknown codes and non-JSON failures', () => {
    expect(tryOnErrorMessage(copy, 400, 'invalid_product_image')).toBe(copy.errorGeneric.default)
    expect(tryOnErrorMessage(copy, 504)).toBe(copy.errorGeneric.default)
    expect(tryOnErrorMessage(copy, 500, 'toString')).toBe(copy.errorGeneric.default)
  })
})
