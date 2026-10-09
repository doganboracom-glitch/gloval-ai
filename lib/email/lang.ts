export type EmailLang = 'tr' | 'en'

export const DEFAULT_EMAIL_LANG: EmailLang = 'tr'

const LANG_TAG = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i

/**
 * Maps one language value to an email language, or `null` when the value
 * carries no usable language information (missing, empty, not a string, not a
 * language tag).
 *
 * Emails are written in Turkish and English only: Turkish stays Turkish, every
 * other well-formed language tag (fr, de, ar, ja, ...) reads as English.
 */
export function parseEmailLang(value: unknown): EmailLang | null {
  if (typeof value !== 'string') return null
  const tag = value.trim()
  if (!tag || !LANG_TAG.test(tag)) return null
  return tag.toLowerCase().split(/[-_]/)[0] === 'tr' ? 'tr' : 'en'
}

/**
 * Picks the language from candidates ordered by priority. The first candidate
 * that carries a language wins; when none does, the product default (Turkish)
 * applies, never English.
 */
export function resolveEmailLang(...candidates: unknown[]): EmailLang {
  for (const candidate of candidates) {
    const lang = parseEmailLang(candidate)
    if (lang) return lang
  }
  return DEFAULT_EMAIL_LANG
}
