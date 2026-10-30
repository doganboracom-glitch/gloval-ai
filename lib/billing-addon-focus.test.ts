import { describe, expect, it } from 'vitest'
import { addonCardId, readAddonParam } from '@/lib/billing-addon-focus'

describe('billing addon focus helpers', () => {
  it('builds a stable card id from the add-on code', () => {
    expect(addonCardId('aura_cursor')).toBe('addon-aura_cursor')
  })

  it('reads a plain add-on code from the query string', () => {
    expect(readAddonParam('?addon=aura_cursor')).toBe('aura_cursor')
    expect(readAddonParam('?foo=1&addon=multilang')).toBe('multilang')
  })

  it('ignores a missing, empty or unsafe addon value', () => {
    expect(readAddonParam('')).toBeNull()
    expect(readAddonParam('?addon=')).toBeNull()
    expect(readAddonParam('?addon=a b')).toBeNull()
    expect(readAddonParam('?addon=%3Cscript%3E')).toBeNull()
    expect(readAddonParam('?addon=AURA')).toBeNull()
  })
})
