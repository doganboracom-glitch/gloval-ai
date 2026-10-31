import { describe, expect, it } from 'vitest'
import { getSupportCopy } from '@/components/support/support-copy'
import { TICKET_DEPARTMENTS } from '@/lib/support/constants'

describe('support department translations', () => {
  it('keeps Turkish, English, and fallback department keys aligned with the server values', () => {
    const tr = getSupportCopy('tr')
    const en = getSupportCopy('en')
    const other = getSupportCopy('ar' as Parameters<typeof getSupportCopy>[0])

    expect(Object.keys(tr.departments)).toEqual(TICKET_DEPARTMENTS)
    expect(Object.keys(en.departments)).toEqual(TICKET_DEPARTMENTS)
    expect(Object.keys(other.departments)).toEqual(TICKET_DEPARTMENTS)
    expect(other.departments).toEqual(en.departments)
  })

  it('uses the same product label in Turkish and English', () => {
    expect(getSupportCopy('tr').departments['gloval-ads']).toBe('GLOVAL Ads')
    expect(getSupportCopy('en').departments['gloval-ads']).toBe('GLOVAL Ads')
  })
})
