import { describe, expect, it } from 'vitest'
import {
  FORWARD_FILTER_TYPE,
  FORWARD_SCRIPT_DESC,
  buildForwardScript,
  filterRowFromApi,
  parseForwardScript,
  readForwarding,
  validateForwardingDestinations,
  type FilterRow,
} from './forwarding'

const row = (over: Partial<FilterRow>): FilterRow => ({
  id: '1',
  active: true,
  filterType: FORWARD_FILTER_TYPE,
  desc: FORWARD_SCRIPT_DESC,
  data: buildForwardScript(['a@gmail.com'], false),
  ...over,
})

describe('forward script', () => {
  it('builds and parses a plain redirect', () => {
    const script = buildForwardScript(['a@gmail.com', 'b@x.io'], false)
    expect(script).toBe('redirect "a@gmail.com";\nredirect "b@x.io";\n')
    expect(parseForwardScript(script)).toEqual({ destinations: ['a@gmail.com', 'b@x.io'], keepCopy: false })
  })

  it('builds and parses a copy redirect', () => {
    const script = buildForwardScript(['a@gmail.com'], true)
    expect(script).toBe('require ["copy"];\nredirect :copy "a@gmail.com";\n')
    expect(parseForwardScript(script)).toEqual({ destinations: ['a@gmail.com'], keepCopy: true })
  })

  it('refuses unnormalised or empty input', () => {
    expect(() => buildForwardScript([], false)).toThrow()
    expect(() => buildForwardScript(['A@Gmail.com'], false)).toThrow()
    expect(() => buildForwardScript(['a@b.com"; discard; "'], false)).toThrow()
  })

  it('reports anything hand-written as unreadable', () => {
    expect(parseForwardScript('if header :contains "subject" "x" { discard; }')).toBeNull()
    expect(parseForwardScript('redirect "a@gmail.com";\ndiscard;')).toBeNull()
    expect(parseForwardScript('redirect :copy "a@gmail.com";')).toBeNull()
    expect(parseForwardScript('')).toBeNull()
    expect(parseForwardScript(undefined)).toBeNull()
  })
})

describe('validateForwardingDestinations', () => {
  const base = { mailboxAddress: 'info@acme.com', domain: 'acme.com' }

  it('treats an empty list as turning forwarding off', () => {
    expect(validateForwardingDestinations({ ...base, destinations: [], internalAddresses: new Set() })).toEqual({
      ok: true,
      destinations: [],
    })
  })

  it('rejects the mailbox itself and unknown own-domain addresses', () => {
    const known = new Set(['info@acme.com', 'sales@acme.com'])
    expect(validateForwardingDestinations({ ...base, destinations: ['info@acme.com'], internalAddresses: known })).toMatchObject({
      ok: false,
      code: 'SELF_DESTINATION',
    })
    expect(validateForwardingDestinations({ ...base, destinations: ['ghost@acme.com'], internalAddresses: known })).toMatchObject({
      ok: false,
      code: 'INVALID_DESTINATION',
    })
  })

  it('allows own-domain mailboxes and external addresses', () => {
    const known = new Set(['info@acme.com', 'sales@acme.com'])
    expect(
      validateForwardingDestinations({ ...base, destinations: ['sales@acme.com', 'me@gmail.com'], internalAddresses: known }),
    ).toEqual({ ok: true, destinations: ['sales@acme.com', 'me@gmail.com'] })
  })
})

describe('readForwarding', () => {
  it('is none without an owned filter', () => {
    expect(readForwarding([]).state).toBe('none')
  })

  it('never treats a customer filter as ours', () => {
    const read = readForwarding([row({ id: '9', desc: 'my rule', data: 'discard;' })])
    expect(read.state).toBe('none')
    expect(read.owned).toHaveLength(0)
  })

  it('reads our filter', () => {
    const read = readForwarding([row({})])
    expect(read).toMatchObject({ state: 'forwarding', active: true })
  })

  it('flags a hand-edited owned filter as unreadable', () => {
    expect(readForwarding([row({ data: 'discard;' })]).state).toBe('unreadable')
  })

  it('reports another active postfilter as a blocker', () => {
    const read = readForwarding([row({ id: '9', desc: 'my rule', data: 'discard;' })])
    expect(read.blocker?.id).toBe('9')
    const inactive = readForwarding([row({ id: '9', desc: 'my rule', active: false })])
    expect(inactive.blocker).toBeNull()
  })
})

describe('filterRowFromApi', () => {
  it('maps Mailcow field names and numeric flags', () => {
    expect(
      filterRowFromApi({ id: 4, active: 1, filter_type: 'postfilter', script_desc: 'x', script_data: 'y' }),
    ).toEqual({ id: '4', active: true, filterType: 'postfilter', desc: 'x', data: 'y' })
    expect(filterRowFromApi({ id: 5, active: '0' })?.active).toBe(false)
    expect(filterRowFromApi(null)).toBeNull()
    expect(filterRowFromApi({})).toBeNull()
  })
})
