import { describe, expect, it } from 'vitest'
import { isAuthorizedCronRequest } from '@/lib/ads/cron-auth'

describe('cron authorization', () => {
  it('accepts only the configured bearer secret', () => {
    expect(isAuthorizedCronRequest('Bearer cron-secret-value', 'cron-secret-value')).toBe(true)
    expect(isAuthorizedCronRequest('Bearer wrong-secret', 'cron-secret-value')).toBe(false)
    expect(isAuthorizedCronRequest('cron-secret-value', 'cron-secret-value')).toBe(false)
  })

  it('fails closed when the secret or header is missing', () => {
    expect(isAuthorizedCronRequest(null, 'cron-secret-value')).toBe(false)
    expect(isAuthorizedCronRequest('Bearer cron-secret-value', undefined)).toBe(false)
  })
})
