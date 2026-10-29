import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptAuthCode, encryptAuthCode } from '../transfer-crypto'
import { decryptContactBackup, encryptContactBackup, PROBE_BACKUP_KEY_LABEL } from './backup-crypto'
import type { DomainContact } from '../types'

const contact = { name: 'Ada Lovelace', email: 'ada@example.com' } as unknown as DomainContact
const previous = process.env.DOMAIN_TRANSFER_SECRET

beforeEach(() => {
  process.env.DOMAIN_TRANSFER_SECRET = 'unit-test-secret-0123456789'
})
afterEach(() => {
  if (previous === undefined) delete process.env.DOMAIN_TRANSFER_SECRET
  else process.env.DOMAIN_TRANSFER_SECRET = previous
})

describe('contact backup encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const payload = encryptContactBackup(contact)!
    expect(payload).not.toContain('ada@example.com')
    expect(decryptContactBackup(payload)).toEqual(contact)
  })

  it('fails closed without the secret', () => {
    delete process.env.DOMAIN_TRANSFER_SECRET
    expect(encryptContactBackup(contact)).toBeNull()
  })

  it('is domain-separated from the EPP-code key in both directions', () => {
    const backup = encryptContactBackup(contact)!
    expect(decryptAuthCode(backup)).toBeNull()
    const eppCode = encryptAuthCode(JSON.stringify(contact))!
    expect(decryptContactBackup(eppCode)).toBeNull()
    expect(decryptAuthCode(backup, 'another-purpose')).toBeNull()
    expect(decryptAuthCode(backup, PROBE_BACKUP_KEY_LABEL)).not.toBeNull()
  })

  it('keeps the legacy EPP-code key unchanged when no purpose is given', () => {
    expect(decryptAuthCode(encryptAuthCode('ABC-123')!)).toBe('ABC-123')
  })
})
