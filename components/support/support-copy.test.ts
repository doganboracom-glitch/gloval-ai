import { describe, expect, it } from 'vitest'
import { getSupportCopy } from '@/components/support/support-copy'
import { TICKET_DEPARTMENTS } from '@/lib/support/constants'

describe('support department copy', () => {
  it('keeps department labels aligned and places GLOVAL Ads after AI in both locales', () => {
    const tr = getSupportCopy('tr').departments
    const en = getSupportCopy('en').departments

    expect(Object.keys(tr)).toEqual([...TICKET_DEPARTMENTS])
    expect(Object.keys(en)).toEqual([...TICKET_DEPARTMENTS])
    expect(tr['gloval-ads']).toBe('GLOVAL Ads')
    expect(en['gloval-ads']).toBe('GLOVAL Ads')
  })
})
