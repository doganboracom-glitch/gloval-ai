/**
 * Mailbox password rules, shared by the dialogs (live feedback) and the server
 * actions (the authority). Pure and side-effect free so both can import it.
 */

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

export type PasswordIssue = 'too_short' | 'too_long' | 'no_letter' | 'no_digit' | 'mismatch'

export type PasswordRuleState = {
  minLength: boolean
  hasLetter: boolean
  hasDigit: boolean
  matches: boolean
}

const LETTER_RE = /\p{L}/u
const DIGIT_RE = /\d/

/** Per-rule pass/fail, used to render the live checklist under the field. */
export function checkPasswordRules(password: string, confirm: string): PasswordRuleState {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasLetter: LETTER_RE.test(password),
    hasDigit: DIGIT_RE.test(password),
    matches: password.length > 0 && password === confirm,
  }
}

/** Every rule the password breaks, empty when it is acceptable. */
export function validateMailboxPassword(password: unknown, confirm: unknown): PasswordIssue[] {
  if (typeof password !== 'string' || typeof confirm !== 'string') return ['too_short']

  const issues: PasswordIssue[] = []
  if (password.length < PASSWORD_MIN_LENGTH) issues.push('too_short')
  if (password.length > PASSWORD_MAX_LENGTH) issues.push('too_long')
  if (!LETTER_RE.test(password)) issues.push('no_letter')
  if (!DIGIT_RE.test(password)) issues.push('no_digit')
  if (password !== confirm) issues.push('mismatch')
  return issues
}

const LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%*-_'
const ALL = LETTERS + DIGITS + SYMBOLS

function randomIndex(max: number): number {
  // Rejection sampling keeps the distribution uniform (no modulo bias).
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  do {
    globalThis.crypto.getRandomValues(buffer)
  } while (buffer[0] >= limit)
  return buffer[0] % max
}

/**
 * Client-side suggestion only. The result is placed in the form fields and is
 * submitted like any typed password; it is never sent anywhere separately.
 */
export function generateStrongPassword(length = 16): string {
  const size = Math.max(length, PASSWORD_MIN_LENGTH)
  const chars = [
    LETTERS[randomIndex(LETTERS.length)],
    DIGITS[randomIndex(DIGITS.length)],
    ...Array.from({ length: size - 2 }, () => ALL[randomIndex(ALL.length)]),
  ]
  // Fisher-Yates so the guaranteed letter/digit are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
