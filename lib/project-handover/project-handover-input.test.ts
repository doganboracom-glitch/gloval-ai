import { describe, expect, it } from 'vitest'
import { validateProjectHandoverForm } from './input'
import { buildFormerOwnerSiteNotice, buildNewOwnerSiteNotice, projectHandoverRef } from './notice-copy'

const base = {
  projectId: '11111111-1111-4111-8111-111111111111',
  fromUserId: '22222222-2222-4222-8222-222222222222',
  toEmail: ' New@Example.com ',
  reason: 'Müşteri talebi üzerine devir',
  idempotencyKey: 'key-1',
  ack: true,
}

describe('validateProjectHandoverForm', () => {
  it('normalizes a valid form', () => {
    const r = validateProjectHandoverForm(base)
    expect(r.ok && r.form.toEmail).toBe('new@example.com')
  })
  it.each([
    [{ projectId: 'x' }, 'bad_project'],
    [{ fromUserId: '' }, 'bad_owner'],
    [{ toEmail: 'nope' }, 'bad_email'],
    [{ reason: 'kısa' }, 'reason_required'],
    [{ ack: false }, 'ack_required'],
    [{ idempotencyKey: '' }, 'bad_key'],
  ])('rejects %j', (patch, code) => {
    const r = validateProjectHandoverForm({ ...base, ...patch })
    expect(!r.ok && r.code).toBe(code)
  })
})

describe('notices', () => {
  const input = { lang: 'tr' as const, siteName: 'Kafe', date: new Date('2026-01-05T10:00:00Z'), ref: 'ABCD1234' }
  it('never leaks the counterpart in either notice', () => {
    const joined = JSON.stringify([buildFormerOwnerSiteNotice(input), buildNewOwnerSiteNotice(input)])
    expect(joined).not.toMatch(/@/)
  })
  it('builds a short reference', () => {
    expect(projectHandoverRef('abcd1234-0000-4000-8000-000000000000')).toBe('ABCD1234')
  })
})
