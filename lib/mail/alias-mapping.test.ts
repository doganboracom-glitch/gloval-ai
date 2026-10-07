import { describe, expect, it } from 'vitest'
import {
  aliasFromRow,
  classifyAliasConflict,
  isMailboxSelfRow,
  parseActive,
  selectAliasRows,
  splitGoto,
} from './alias-mapping'

describe('parseActive', () => {
  it('treats only explicit off values as inactive', () => {
    for (const v of [0, '0', false, 'false', 'off', ' 0 ']) expect(parseActive(v)).toBe(false)
    for (const v of [1, '1', true, 'true', undefined, null]) expect(parseActive(v)).toBe(true)
  })
})

describe('splitGoto', () => {
  it('handles comma strings and arrays', () => {
    expect(splitGoto('a@x.com, b@gmail.com')).toEqual(['a@x.com', 'b@gmail.com'])
    expect(splitGoto(['a@x.com'])).toEqual(['a@x.com'])
    expect(splitGoto(undefined)).toEqual([])
  })
})

describe('selectAliasRows', () => {
  const rows = [
    { id: 1, address: 'info@example.com', goto: 'info@example.com', active: 1 },
    { id: 2, address: 'iletisim@example.com', goto: 'info@example.com', active: 1 },
    { id: 3, address: 'sales@example.com', goto: 'me@gmail.com', active: 0 },
    { id: 4, address: 'x@other.com', goto: 'y@gmail.com', active: 1 },
    { id: 5, address: 'IletisimCaps@Example.com', goto: 'me@gmail.com', active: '1' },
    { address: 'noid@example.com', goto: 'a@b.com' },
  ]

  it('drops mailbox self-rows, other domains and rows without an id', () => {
    expect(selectAliasRows(rows, 'example.com').map((r) => r.id)).toEqual([2, 3, 5])
  })

  it('keeps inactive aliases and aliases with external destinations', () => {
    const kept = selectAliasRows(rows, 'example.com').map((r) => aliasFromRow(r, 'd1'))
    const sales = kept.find((a) => a.address === 'sales@example.com')
    expect(sales).toMatchObject({ active: false, destinations: ['me@gmail.com'] })
  })

  it('returns [] for non-array payloads', () => {
    expect(selectAliasRows({ type: 'error' }, 'example.com')).toEqual([])
    expect(selectAliasRows(null, 'example.com')).toEqual([])
  })

  it('does not treat a multi-destination alias containing its own address as a self-row', () => {
    expect(isMailboxSelfRow({ address: 'a@x.com', goto: 'a@x.com,b@gmail.com' })).toBe(false)
    expect(isMailboxSelfRow({ address: 'A@x.com', goto: 'a@x.com' })).toBe(true)
  })
})

describe('classifyAliasConflict', () => {
  const base = { message: 'object_exists', address: 'info@example.com' }

  it('reports a mailbox when the live mailbox list contains the address', () => {
    expect(
      classifyAliasConflict({ ...base, mailboxAddresses: ['INFO@example.com'], aliasAddresses: [] }),
    ).toBe('ADDRESS_IS_MAILBOX')
  })

  it('reports an alias when the live alias list contains the address', () => {
    expect(classifyAliasConflict({ ...base, mailboxAddresses: [], aliasAddresses: ['info@example.com'] })).toBe(
      'ALIAS_EXISTS',
    )
  })

  it('falls back to the message when the lists do not know the address', () => {
    expect(classifyAliasConflict({ ...base, mailboxAddresses: [], aliasAddresses: [] })).toBe('ALIAS_EXISTS')
    expect(
      classifyAliasConflict({ ...base, message: 'is_mailbox', mailboxAddresses: [], aliasAddresses: [] }),
    ).toBe('ADDRESS_IS_MAILBOX')
  })

  it('returns null for failures that are not conflicts', () => {
    expect(
      classifyAliasConflict({ ...base, message: 'access_denied', mailboxAddresses: [], aliasAddresses: [] }),
    ).toBeNull()
  })
})
