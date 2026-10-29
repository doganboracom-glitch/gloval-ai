import { describe, expect, it } from 'vitest'
import { DEFAULT_TRY_ON_STORE_DAILY_LIMIT, tryOnStoreDailyLimit, tryOnStoreSubject } from './try-on-store-limit'

describe('tryOnStoreDailyLimit', () => {
  it('defaults to 100 attempts per day', () => {
    expect(DEFAULT_TRY_ON_STORE_DAILY_LIMIT).toBe(100)
    expect(tryOnStoreDailyLimit(undefined)).toBe(100)
  })

  it('accepts a positive integer override', () => {
    expect(tryOnStoreDailyLimit('250')).toBe(250)
  })

  it.each(['', '0', '-5', '1.5', 'abc'])('falls back to the default for invalid value %j', (raw) => {
    expect(tryOnStoreDailyLimit(raw)).toBe(100)
  })
})

describe('tryOnStoreSubject', () => {
  it('is case-insensitive so one store never gets two counters', () => {
    expect(tryOnStoreSubject('Luna-Mucevher')).toBe('tryon-store:luna-mucevher')
  })
})
