import { describe, expect, it } from 'vitest'
import { isTicketDepartment, TICKET_DEPARTMENTS } from '@/lib/support/constants'

describe('support ticket departments', () => {
  it('includes GLOVAL Ads immediately after AI', () => {
    expect(TICKET_DEPARTMENTS).toEqual([
      'technical',
      'billing',
      'domain',
      'website',
      'ai',
      'gloval-ads',
      'account',
      'other',
    ])
  })

  it('accepts the new server-side department and rejects unknown values', () => {
    expect(isTicketDepartment('gloval-ads')).toBe(true)
    expect(isTicketDepartment('other')).toBe(true)
    expect(isTicketDepartment('gloval-ad')).toBe(false)
    expect(isTicketDepartment(null)).toBe(false)
  })
})
