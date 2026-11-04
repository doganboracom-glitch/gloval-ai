import { REFERRAL_CODE_PATTERN } from '@/lib/referrals/core'

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateReferralCode(
  cryptoApi: Pick<Crypto, 'getRandomValues'> = globalThis.crypto,
): string {
  if (!cryptoApi?.getRandomValues) throw new Error('secure_random_unavailable')

  const limit = Math.floor(256 / REFERRAL_CODE_ALPHABET.length) * REFERRAL_CODE_ALPHABET.length
  let code = ''

  while (code.length < 12) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(24))
    for (const byte of bytes) {
      if (byte >= limit) continue
      code += REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length]
      if (code.length === 12) break
    }
  }

  return code
}

export function isReferralCode(value: unknown): value is string {
  return typeof value === 'string' && REFERRAL_CODE_PATTERN.test(value)
}

export function normalizeTurkishIban(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/[\s-]+/gu, '').toUpperCase()
  if (!/^TR\d{24}$/u.test(normalized) || !isIbanChecksumValid(normalized)) return null
  return normalized
}

export function isIbanChecksumValid(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/u.test(value)) return false

  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`
  let remainder = 0

  for (const character of rearranged) {
    const code = character.charCodeAt(0)
    const expanded = code >= 65 && code <= 90 ? String(code - 55) : character
    for (const digit of expanded) {
      if (digit < '0' || digit > '9') return false
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }

  return remainder === 1
}

export function normalizeReferralPayeeName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) return null
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  if (normalized.length < 2 || normalized.length > 120) return null
  return normalized
}

export function normalizeReferralTaxStatus(value: unknown): 'individual' | 'company' | null {
  return value === 'individual' || value === 'company' ? value : null
}
