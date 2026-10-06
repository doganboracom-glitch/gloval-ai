import { afterEach, describe, expect, it } from 'vitest'
import { decryptAuthCode, encryptAuthCode, isTransferSecretConfigured } from './transfer-crypto'

const original = process.env.DOMAIN_TRANSFER_SECRET

afterEach(() => {
  if (original === undefined) delete process.env.DOMAIN_TRANSFER_SECRET
  else process.env.DOMAIN_TRANSFER_SECRET = original
})

describe('transfer-crypto', () => {
  it('fails closed when DOMAIN_TRANSFER_SECRET is missing or too short', () => {
    delete process.env.DOMAIN_TRANSFER_SECRET
    expect(isTransferSecretConfigured()).toBe(false)
    expect(encryptAuthCode('EPP-secret-123')).toBeNull()
    expect(decryptAuthCode('a.b.c')).toBeNull()

    process.env.DOMAIN_TRANSFER_SECRET = 'short'
    expect(isTransferSecretConfigured()).toBe(false)
    expect(encryptAuthCode('EPP-secret-123')).toBeNull()
  })

  it('round-trips and never stores the plaintext', () => {
    process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
    const enc = encryptAuthCode('EPP-secret-123')
    expect(enc).toBeTruthy()
    expect(enc).not.toContain('EPP-secret-123')
    expect(decryptAuthCode(enc!)).toBe('EPP-secret-123')
  })

  it('uses a fresh IV per encryption', () => {
    process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
    expect(encryptAuthCode('same')).not.toBe(encryptAuthCode('same'))
  })

  it('returns null (no throw, no leak) for a wrong key, tampered or malformed payload', () => {
    process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
    const enc = encryptAuthCode('EPP-secret-123')!

    process.env.DOMAIN_TRANSFER_SECRET = 'a-completely-different-secret'
    expect(decryptAuthCode(enc)).toBeNull()

    process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
    const [iv, tag, body] = enc.split('.')
    const flipped = Buffer.from(body, 'base64')
    flipped[0] ^= 0xff
    expect(decryptAuthCode([iv, tag, flipped.toString('base64')].join('.'))).toBeNull()
    expect(decryptAuthCode('garbage')).toBeNull()
  })
})
