import { describe, expect, it } from 'vitest'
import { isReferralFeatureEnabled } from '@/lib/referrals/core'
import {
  generateReferralCode,
  isReferralCode,
  isIbanChecksumValid,
  normalizeReferralPayeeName,
  normalizeReferralTaxStatus,
  normalizeTurkishIban,
} from '@/lib/referrals/partner-core'

function ibanRemainder(value: string): number {
  let remainder = 0
  for (const character of value) {
    const code = character.charCodeAt(0)
    const expanded = code >= 65 && code <= 90 ? String(code - 55) : character
    for (const digit of expanded) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

function validTurkishIban(account = '1234567890123456789012'): string {
  const checkDigits = String(98 - ibanRemainder(`${account}TR00`)).padStart(2, '0')
  return `TR${checkDigits}${account}`
}

describe('referral partner core', () => {
  it('fails closed unless the referral feature flag is exactly enabled', () => {
    expect(isReferralFeatureEnabled({ REFERRAL_ENABLED: '0' })).toBe(false)
    expect(isReferralFeatureEnabled({ REFERRAL_ENABLED: 'true' })).toBe(false)
    expect(isReferralFeatureEnabled({ REFERRAL_ENABLED: '1' })).toBe(true)
  })

  it('generates unique, valid referral codes', () => {
    const codes = Array.from({ length: 200 }, () => generateReferralCode())
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((code) => isReferralCode(code))).toBe(true)
  })

  it('normalizes valid Turkish IBANs and rejects invalid checksums', () => {
    const iban = validTurkishIban()
    expect(isIbanChecksumValid(iban)).toBe(true)
    expect(normalizeTurkishIban(`${iban.slice(0, 4)} ${iban.slice(4)}`)).toBe(iban)
    expect(normalizeTurkishIban(`${iban.slice(0, -1)}${iban.endsWith('9') ? '8' : '9'}`)).toBeNull()
    expect(normalizeTurkishIban(iban.replace(/^TR/u, 'DE'))).toBeNull()
  })

  it('normalizes payee names and accepts only known tax statuses', () => {
    expect(normalizeReferralPayeeName('  Ayşe   Yılmaz  ')).toBe('Ayşe Yılmaz')
    expect(normalizeReferralPayeeName('x')).toBeNull()
    expect(normalizeReferralPayeeName('A\nB')).toBeNull()
    expect(normalizeReferralPayeeName('A'.repeat(121))).toBeNull()
    expect(normalizeReferralTaxStatus('individual')).toBe('individual')
    expect(normalizeReferralTaxStatus('company')).toBe('company')
    expect(normalizeReferralTaxStatus('admin')).toBeNull()
  })
})
