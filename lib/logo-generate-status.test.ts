import { describe, expect, it } from 'vitest'
import { classifyLogoGenerateStatus } from './logo-generate-status'

describe('classifyLogoGenerateStatus', () => {
  it.each([
    [401, 'auth'],
    [402, 'credits'],
    [429, 'dailyLimit'],
    [400, 'failed'],
    [500, 'failed'],
    [502, 'failed'],
  ] as const)('status %i -> %s', (status, kind) => {
    expect(classifyLogoGenerateStatus(status)).toBe(kind)
  })
})
