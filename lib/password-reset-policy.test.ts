import { describe, expect, it } from 'vitest'
import {
  PASSWORD_RESET_BLOCK_WINDOW_MS,
  PASSWORD_RESET_COOLDOWN_SECONDS,
} from './password-reset-policy'

describe('password reset cooldown policy', () => {
  it('keeps the client countdown and server-side throttle aligned at 60 seconds', () => {
    expect(PASSWORD_RESET_COOLDOWN_SECONDS).toBe(60)
    expect(PASSWORD_RESET_BLOCK_WINDOW_MS).toBe(PASSWORD_RESET_COOLDOWN_SECONDS * 1000)
  })
})
