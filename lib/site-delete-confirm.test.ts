import { describe, expect, it } from 'vitest'
import { isDeleteConfirmation } from './site-delete-confirm'

describe('isDeleteConfirmation', () => {
  it.each(['SİL', 'SIL', 'sil', 'Sil', 'sıl', 'SİL'.normalize('NFD'), '  SİL  ', 'DELETE', 'delete'])(
    'accepts %j',
    (value) => {
      expect(isDeleteConfirmation(value)).toBe(true)
    },
  )

  it.each(['', ' ', 'si', 'sill', 'S İ L', 'evet', 'sil site', 'x'.repeat(100)])('rejects %j', (value) => {
    expect(isDeleteConfirmation(value)).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isDeleteConfirmation(undefined)).toBe(false)
    expect(isDeleteConfirmation(null)).toBe(false)
    expect(isDeleteConfirmation(42)).toBe(false)
  })
})
