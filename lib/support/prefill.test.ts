import { describe, expect, it, vi } from 'vitest'
import { MESSAGE_MAX, SUBJECT_MAX } from '@/lib/support/constants'
import {
  EMPTY_TICKET_PREFILL,
  newTicketHref,
  newTicketPathWithParams,
  parseTicketPrefill,
  probeSupportReachable,
} from '@/lib/support/prefill'

describe('newTicketHref', () => {
  it('is the bare path with no prefill', () => {
    expect(newTicketHref({})).toBe('/support/new')
  })

  it('leaves out empty and default values', () => {
    const href = newTicketHref({ subject: 'Hi', service: 'none', projectId: 'none', department: '' })
    expect(href).toBe('/support/new?subject=Hi')
  })
})

describe('parseTicketPrefill', () => {
  it('returns the form defaults for an empty query', () => {
    expect(parseTicketPrefill({}, [])).toEqual(EMPTY_TICKET_PREFILL)
  })

  it('accepts known values and a project the user owns', () => {
    const prefill = parseTicketPrefill(
      { subject: 'S', message: 'M', department: 'website', service: 'ai_content', project: 'p1' },
      ['p1'],
    )
    expect(prefill).toEqual({ subject: 'S', message: 'M', department: 'website', service: 'ai_content', projectId: 'p1' })
  })

  it('ignores unknown categories and a project that is not theirs', () => {
    const prefill = parseTicketPrefill({ department: 'hack', service: 'nope', project: 'someone-else' }, ['p1'])
    expect(prefill.department).toBe('')
    expect(prefill.service).toBe('none')
    expect(prefill.projectId).toBe('none')
  })

  it('clamps text to the server limits and takes the first of repeated params', () => {
    const prefill = parseTicketPrefill({ subject: 'x'.repeat(SUBJECT_MAX + 50), message: ['a'.repeat(MESSAGE_MAX + 10), 'b'] }, [])
    expect(prefill.subject).toHaveLength(SUBJECT_MAX)
    expect(prefill.message).toHaveLength(MESSAGE_MAX)
  })
})

describe('newTicketPathWithParams', () => {
  it('keeps the prefill so a login redirect can return to it', () => {
    expect(newTicketPathWithParams({ subject: 'A b', project: 'p1', empty: undefined })).toBe('/support/new?subject=A+b&project=p1')
    expect(newTicketPathWithParams({})).toBe('/support/new')
  })
})

describe('probeSupportReachable', () => {
  const respond = (init: Partial<Response>) => vi.fn().mockResolvedValue(init as Response) as unknown as typeof fetch

  it('is reachable on a normal response or an opaque login redirect', async () => {
    expect(await probeSupportReachable(respond({ type: 'basic', status: 200 }))).toBe(true)
    expect(await probeSupportReachable(respond({ type: 'opaqueredirect', status: 0 }))).toBe(true)
  })

  it('is unreachable on 404, 5xx or a network error', async () => {
    expect(await probeSupportReachable(respond({ type: 'basic', status: 404 }))).toBe(false)
    expect(await probeSupportReachable(respond({ type: 'basic', status: 503 }))).toBe(false)
    expect(await probeSupportReachable(vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch)).toBe(false)
  })
})
