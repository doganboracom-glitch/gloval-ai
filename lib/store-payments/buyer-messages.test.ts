import { describe, expect, it } from 'vitest'
import {
  BUYER_INFO_FALLBACK_MESSAGE,
  buyerIssueMessage,
  buyerIssuesMessage,
} from '@/lib/store-payments/buyer-messages'

describe('buyer issue messages', () => {
  it('tells an empty field from a malformed one', () => {
    expect(buyerIssueMessage({ field: 'phone', problem: 'missing' })).toBe('Telefon alanı boş bırakılamaz.')
    expect(buyerIssueMessage({ field: 'phone', problem: 'invalid' })).toContain('10 haneli')
    expect(buyerIssueMessage({ field: 'postalCode', problem: 'invalid' })).toContain('5 haneli')
  })

  it('names only the fields that have a problem', () => {
    const msg = buyerIssuesMessage([
      { field: 'email', problem: 'invalid' },
      { field: 'city', problem: 'missing' },
    ])
    expect(msg).toContain('E-posta adresi geçerli değil')
    expect(msg).toContain('Şehir alanı boş bırakılamaz')
    expect(msg).not.toContain('Telefon')
  })

  it('falls back to the generic text when no field was named', () => {
    expect(buyerIssuesMessage(undefined)).toBe(BUYER_INFO_FALLBACK_MESSAGE)
    expect(buyerIssuesMessage([])).toBe(BUYER_INFO_FALLBACK_MESSAGE)
  })
})
