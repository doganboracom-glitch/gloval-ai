import { describe, expect, it } from 'vitest'
import {
  buildHandoverMeta,
  handoverErrorMessage,
  isHandoverSubmitEnabled,
  validateHandoverForm,
  validateReleaseForm,
  WAIVER_LABEL,
} from './input'

const base = {
  domain: ' Ornek.COM ',
  toEmail: ' Yeni@Ornek.com ',
  reason: 'Yazılı talep üzerine devir',
  giverWaiverConfirmed: true,
  giverWaiverTicket: 'TKT-1001',
  confirmDomain: 'ornek.com',
  idempotencyKey: 'key-1',
}

describe('validateHandoverForm', () => {
  it('normalizes domain and e-mail and accepts a complete form', () => {
    const res = validateHandoverForm(base)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.form.domain).toBe('ornek.com')
      expect(res.form.toEmail).toBe('yeni@ornek.com')
    }
  })

  it('requires the giver waiver (giver_waiver_required)', () => {
    for (const value of [false, undefined, 'false', 0, null]) {
      expect(validateHandoverForm({ ...base, giverWaiverConfirmed: value })).toEqual({
        ok: false,
        code: 'giver_waiver_required',
      })
    }
  })

  it('requires a support ticket number', () => {
    expect(validateHandoverForm({ ...base, giverWaiverTicket: '  ' })).toEqual({
      ok: false,
      code: 'giver_waiver_ticket_required',
    })
  })

  it('rejects a short reason, a mismatched confirmation and a missing idempotency key', () => {
    expect(validateHandoverForm({ ...base, reason: 'kısa' })).toEqual({ ok: false, code: 'reason_required' })
    expect(validateHandoverForm({ ...base, confirmDomain: 'baska.com' })).toEqual({ ok: false, code: 'confirm_mismatch' })
    expect(validateHandoverForm({ ...base, idempotencyKey: '' })).toEqual({ ok: false, code: 'ack_required' })
  })
})

describe('buildHandoverMeta', () => {
  it('sends giver_waiver_confirmed as a JSON boolean true plus the ticket', () => {
    const res = validateHandoverForm(base)
    if (!res.ok) throw new Error('form invalid')
    const meta = buildHandoverMeta(res.form, 0)
    expect(meta.giver_waiver_confirmed).toBe(true)
    expect(meta.giver_waiver_ticket).toBe('TKT-1001')
    expect(meta.mailbox_count_at_handover).toBe(0)
  })
})

describe('isHandoverSubmitEnabled', () => {
  const ready = {
    canHandover: true,
    waiver: true,
    ticket: 'TKT-1',
    reason: 'yeterince uzun gerekçe',
    confirmDomain: 'ornek.com',
    domain: 'ornek.com',
    mailboxUnknown: false,
    mailboxUnknownAck: false,
    pending: false,
  }

  it('is enabled only when everything is satisfied', () => {
    expect(isHandoverSubmitEnabled(ready)).toBe(true)
  })

  it('stays disabled while the waiver checkbox is unchecked', () => {
    expect(isHandoverSubmitEnabled({ ...ready, waiver: false })).toBe(false)
  })

  it('stays disabled without a ticket, reason or domain confirmation', () => {
    expect(isHandoverSubmitEnabled({ ...ready, ticket: ' ' })).toBe(false)
    expect(isHandoverSubmitEnabled({ ...ready, reason: 'kısa' })).toBe(false)
    expect(isHandoverSubmitEnabled({ ...ready, confirmDomain: 'x.com' })).toBe(false)
  })

  it('needs the extra acknowledgement when the mailbox count is unknown', () => {
    expect(isHandoverSubmitEnabled({ ...ready, mailboxUnknown: true })).toBe(false)
    expect(isHandoverSubmitEnabled({ ...ready, mailboxUnknown: true, mailboxUnknownAck: true })).toBe(true)
  })

  it('stays disabled when a prerequisite fails or a request is in flight', () => {
    expect(isHandoverSubmitEnabled({ ...ready, canHandover: false })).toBe(false)
    expect(isHandoverSubmitEnabled({ ...ready, pending: true })).toBe(false)
  })

  it('uses the approved waiver wording', () => {
    expect(WAIVER_LABEL).toBe(
      'Devreden taraf kendi verilerini yedeklediğini ve devir sonrası alan adı üzerinde hak talep etmeyeceğini yazılı beyan etti (destek talebi no: ...)',
    )
  })
})

describe('validateReleaseForm', () => {
  const ok = { mode: 'empty_handover', confirmDomain: 'ornek.com', ack: true, idempotencyKey: 'rk-1' }

  it('accepts the default empty hand-over', () => {
    expect(validateReleaseForm(ok, 'ornek.com')).toMatchObject({ ok: true, mode: 'empty_handover', consentNote: null })
  })

  it('rejects an unknown mode, a missing acknowledgement and a wrong confirmation', () => {
    expect(validateReleaseForm({ ...ok, mode: 'x' }, 'ornek.com')).toEqual({ ok: false, code: 'bad_release_mode' })
    expect(validateReleaseForm({ ...ok, ack: false }, 'ornek.com')).toEqual({ ok: false, code: 'ack_required' })
    expect(validateReleaseForm({ ...ok, confirmDomain: 'x.com' }, 'ornek.com')).toEqual({ ok: false, code: 'confirm_mismatch' })
  })

  it('requires a trimmed consent note of at least 10 characters for the exception', () => {
    const keep = { ...ok, mode: 'keep_mailboxes_with_consent' }
    expect(validateReleaseForm({ ...keep, consentNote: '         ' }, 'ornek.com')).toEqual({ ok: false, code: 'consent_note_required' })
    expect(validateReleaseForm({ ...keep, consentNote: '123456789' }, 'ornek.com')).toEqual({ ok: false, code: 'consent_note_required' })
    expect(validateReleaseForm({ ...keep, consentNote: 'Yazılı onay, talep 1234' }, 'ornek.com')).toMatchObject({
      ok: true,
      mode: 'keep_mailboxes_with_consent',
      consentNote: 'Yazılı onay, talep 1234',
    })
  })
})

describe('handoverErrorMessage', () => {
  it('has Turkish text for the waiver codes and a safe fallback', () => {
    expect(handoverErrorMessage('giver_waiver_required')).toContain('beyan')
    expect(handoverErrorMessage('unknown_code')).toBe('İşlem tamamlanamadı.')
  })
})
