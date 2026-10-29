import { describe, expect, it } from 'vitest'
import {
  backupTtlMs,
  evaluateStartPolicy,
  isProbeEnabled,
  maxReadbacks,
  nextReadbackAt,
  readbackPhase,
} from './policy'

const ON = {
  DOMAIN_REGISTRAR_PROBE_ENABLED: 'true',
  VERCEL_ENV: 'production',
  DOMAIN_REGISTRAR_PROBE_DOMAINS: 'probe-one.com, Probe-Two.net',
}
const REGISTRANT_ON = { ...ON, DOMAIN_REGISTRAR_PROBE_REGISTRANT_ENABLED: 'true' }
const base = { domain: 'probe-one.com', testEmail: 'test@example.com' }

describe('isProbeEnabled', () => {
  it('is off by default', () => {
    expect(isProbeEnabled({})).toBe(false)
  })
  it('needs the literal string "true"', () => {
    expect(isProbeEnabled({ ...ON, DOMAIN_REGISTRAR_PROBE_ENABLED: '1' })).toBe(false)
    expect(isProbeEnabled(ON)).toBe(true)
  })
  it('stays off outside a Vercel Production runtime', () => {
    expect(isProbeEnabled({ ...ON, VERCEL_ENV: 'preview' })).toBe(false)
    expect(isProbeEnabled({ ...ON, VERCEL_ENV: 'development' })).toBe(false)
    expect(isProbeEnabled({ DOMAIN_REGISTRAR_PROBE_ENABLED: 'true' })).toBe(false)
  })
})

describe('evaluateStartPolicy', () => {
  it('rejects everything while disabled', () => {
    expect(evaluateStartPolicy(base, {})).toEqual({ ok: false, error: 'probe_disabled' })
  })

  it('only accepts allow-listed domains (case-insensitive)', () => {
    expect(evaluateStartPolicy({ ...base, domain: 'other.com' }, ON)).toEqual({ ok: false, error: 'domain_not_allowed' })
    expect(evaluateStartPolicy({ ...base, domain: 'PROBE-TWO.net' }, ON)).toMatchObject({ ok: true, domain: 'probe-two.net' })
  })

  it('rejects an empty allow-list', () => {
    expect(evaluateStartPolicy(base, { ...ON, DOMAIN_REGISTRAR_PROBE_DOMAINS: '' })).toEqual({
      ok: false,
      error: 'domain_not_allowed',
    })
  })

  it('defaults to technical', () => {
    expect(evaluateStartPolicy(base, ON)).toMatchObject({ ok: true, contactType: 'technical', registrantApprovalNote: null })
  })

  it('rejects unknown contact types and bad emails', () => {
    expect(evaluateStartPolicy({ ...base, contactType: 'owner' }, ON)).toEqual({ ok: false, error: 'invalid_contact_type' })
    expect(evaluateStartPolicy({ ...base, testEmail: 'nope' }, ON)).toEqual({ ok: false, error: 'invalid_test_email' })
  })

  describe('registrant', () => {
    const registrant = { ...base, contactType: 'registrant', registrantConfirmed: true, registrantApprovalNote: 'Written approval 2026-11-02 ref A1' }

    it('is impossible without its own switch', () => {
      expect(evaluateStartPolicy(registrant, ON)).toEqual({ ok: false, error: 'registrant_probe_disabled' })
    })
    it('needs registrantConfirmed === true', () => {
      expect(evaluateStartPolicy({ ...registrant, registrantConfirmed: false }, REGISTRANT_ON)).toEqual({
        ok: false,
        error: 'registrant_confirmation_required',
      })
    })
    it('needs a written approval note of at least 10 characters', () => {
      expect(evaluateStartPolicy({ ...registrant, registrantApprovalNote: ' short ' }, REGISTRANT_ON)).toEqual({
        ok: false,
        error: 'registrant_note_required',
      })
    })
    it('passes with all three gates', () => {
      expect(evaluateStartPolicy(registrant, REGISTRANT_ON)).toMatchObject({
        ok: true,
        contactType: 'registrant',
        registrantApprovalNote: 'Written approval 2026-11-02 ref A1',
      })
    })
  })
})

describe('read-back schedule', () => {
  const submitted = new Date('2026-11-01T00:00:00Z')

  it('uses 1, 6, 24, 48 hours for standard runs', () => {
    expect(maxReadbacks('technical')).toBe(4)
    const hours = [0, 1, 2, 3].map((i) => (nextReadbackAt(submitted, i, 'technical')!.getTime() - submitted.getTime()) / 3_600_000)
    expect(hours).toEqual([1, 6, 24, 48])
    expect(nextReadbackAt(submitted, 4, 'technical')).toBeNull()
  })

  it('adds 72 and 96 hours for registrant runs', () => {
    expect(maxReadbacks('registrant')).toBe(6)
    expect(readbackPhase('registrant', 5)).toBe('readback_96h')
    expect(readbackPhase('technical', 4)).toBeNull()
  })

  it('measures offsets from submission, not from the previous read-back', () => {
    expect(nextReadbackAt(submitted, 2, 'billing')!.toISOString()).toBe('2026-11-02T00:00:00.000Z')
  })
})

describe('backup window', () => {
  it('is 24 hours, or 7 days for registrant (mirrors drp_backup_window)', () => {
    expect(backupTtlMs('technical')).toBe(24 * 3_600_000)
    expect(backupTtlMs('registrant')).toBe(7 * 24 * 3_600_000)
  })
})
