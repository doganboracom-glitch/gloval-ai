import { describe, expect, it } from 'vitest'
import { encryptReferralIban } from '@/lib/referrals/partner-encryption'

function ibanRemainder(value: string): number {
  let remainder = 0
  for (const character of value) {
    const code = character.charCodeAt(0)
    const expanded = code >= 65 && code <= 90 ? String(code - 55) : character
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

function validTurkishIban(): string {
  const account = '1234567890123456789012'
  const checkDigits = String(98 - ibanRemainder(`${account}TR00`)).padStart(2, '0')
  return `TR${checkDigits}${account}`
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0))
}

describe('referral IBAN encryption', () => {
  it('returns a safe failure when the active key is absent', async () => {
    await expect(
      encryptReferralIban(validTurkishIban(), { REFERRAL_IBAN_ENC_ACTIVE_VERSION: 'v1' }),
    ).resolves.toEqual({ ok: false, reason: 'missing_key' })
  })

  it('encrypts valid IBANs with AES-256-GCM and the configured key version', async () => {
    const iban = validTurkishIban()
    const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
    const keyText = Buffer.from(keyBytes).toString('base64')
    const encrypted = await encryptReferralIban(iban, {
      REFERRAL_IBAN_ENC_ACTIVE_VERSION: 'v1',
      REFERRAL_IBAN_ENC_KEY_V1: keyText,
    })

    expect(encrypted.ok).toBe(true)
    if (!encrypted.ok) return

    expect(encrypted.keyVersion).toBe('v1')
    expect(encrypted.last4).toBe(iban.slice(-4))
    expect(encrypted.ciphertext).not.toContain(iban)

    const [ivPart, ciphertextPart] = encrypted.ciphertext.split('.')
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    )
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(ivPart),
        additionalData: new TextEncoder().encode('gloval/referral/iban/v1'),
      },
      cryptoKey,
      decodeBase64Url(ciphertextPart),
    )

    expect(new TextDecoder().decode(plaintext)).toBe(iban)
  })

  it('rejects an invalid IBAN before encryption', async () => {
    await expect(encryptReferralIban('TR000000000000000000000000', {
      REFERRAL_IBAN_ENC_ACTIVE_VERSION: 'v1',
      REFERRAL_IBAN_ENC_KEY_V1: 'x'.repeat(32),
    })).resolves.toEqual({ ok: false, reason: 'invalid_iban' })
  })
})
