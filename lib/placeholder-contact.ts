/**
 * Content-based detection of placeholder contact values (phone, e-mail, address).
 *
 * Sites generated before `sample` flags existed carry no marker, so the publish
 * gate (`lib/sample-content.ts`) also recognises the values themselves. This file
 * is the ONE place that defines what counts as a known fake pattern, and it is
 * deliberately narrow: a value matches only when it looks invented. Real numbers
 * (a 0850 corporate line, a 0212 landline, an ordinary mobile) never match on
 * their prefix alone. Owners can still confirm a match as real at publish time.
 *
 * Pure and dependency free, so the client dialog and the server gate agree.
 */

const digitsOf = (value: string): string => value.replace(/\D/g, '')

/** Fewest digits a string needs before it can be read as a phone number. */
const MIN_PHONE_DIGITS = 7

/** National significant number: drops a leading `90` country code or `0` trunk prefix. */
function nationalDigits(digits: string): string {
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

/** True when `digits` holds `length` consecutive digits counting up or down by one. */
function hasConsecutiveRun(digits: string, length: number): boolean {
  for (let start = 0; start + length <= digits.length; start++) {
    let up = true
    let down = true
    for (let i = 1; i < length; i++) {
      const step = Number(digits[start + i]) - Number(digits[start + i - 1])
      if (step !== 1) up = false
      if (step !== -1) down = false
      if (!up && !down) break
    }
    if (up || down) return true
  }
  return false
}

export type PhonePattern = { id: string; test: (raw: string, digits: string, national: string) => boolean }

/**
 * Known fake phone shapes. Order is irrelevant; any hit marks the value.
 * `id` is only used by tests and diagnostics.
 */
export const PHONE_PLACEHOLDER_PATTERNS: readonly PhonePattern[] = [
  // Template letters/symbols instead of digits: "0212 XXX XX XX", "+90 ### ### ## ##".
  { id: 'template-chars', test: (raw) => /[xX]{3,}|#{3,}|_{3,}/.test(raw) },
  // Seven zeros in a row: "0000000", "+90 850 000 00 00" (the shared demo line).
  { id: 'zero-run', test: (_raw, digits) => /0{7,}/.test(digits) },
  // 0850 line whose subscriber part starts with 000: 850 000 xx xx.
  { id: 'demo-850', test: (_raw, _digits, national) => national.length === 10 && national.startsWith('850000') },
  // Six or more identical digits in a row: "111111", "2222222".
  { id: 'repeated-digit', test: (_raw, digits) => /(\d)\1{5,}/.test(digits) },
  // Seven or more consecutive digits, ascending or descending: "1234567", "7654321".
  { id: 'sequence', test: (_raw, digits) => hasConsecutiveRun(digits, 7) },
  // Fictional landline block "555 01xx" (e.g. +90 212 555 01 23). Mobile numbers
  // starting with 5 are excluded: 0555 is a real operator prefix.
  {
    id: 'fiction-555',
    test: (_raw, _digits, national) => national.length === 10 && !national.startsWith('5') && /^5550[01]\d\d$/.test(national.slice(3)),
  },
]

/** True when the value is a known fake phone pattern. Empty or too short values are never flagged. */
export function isPlaceholderPhone(value: string | undefined | null): boolean {
  const raw = (value ?? '').trim()
  if (!raw) return false
  const digits = digitsOf(raw)
  const hasTemplate = /[xX]{3,}|#{3,}|_{3,}/.test(raw)
  if (digits.length < MIN_PHONE_DIGITS && !hasTemplate) return false
  const national = nationalDigits(digits)
  return PHONE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(raw, digits, national))
}

/** Domain labels (the part before the TLD) that only ever appear in templates and docs. */
export const PLACEHOLDER_EMAIL_DOMAIN_LABELS: ReadonlySet<string> = new Set([
  'example',
  'ornek',
  'ornekfirma',
  'test',
  'domain',
  'yourdomain',
  'yoursite',
  'yourcompany',
  'sitename',
  'companyname',
  'firma',
  'firmaadi',
  'siteadi',
  'alanadi',
  'sirketadi',
])

/** Local parts that are instructions, not mailboxes: "yourname@...", "adiniz@...". */
export const PLACEHOLDER_EMAIL_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'yourname',
  'youremail',
  'your-email',
  'your.name',
  'name',
  'isim',
  'adiniz',
  'isminiz',
  'eposta',
  'epostaadresiniz',
  'email',
  'user',
  'username',
  'kullanici',
])

/** Mailbox names a model puts in front of an invented company domain. */
export const GENERIC_MAILBOX_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'info',
  'iletisim',
  'contact',
  'hello',
  'merhaba',
  'destek',
  'support',
  'bilgi',
  'satis',
  'sales',
])

const COMPANY_TLDS = new Set(['com', 'net', 'org', 'co', 'com.tr', 'net.tr', 'org.tr'])

/** Lowercases, folds Turkish letters, keeps only [a-z0-9]. */
export function foldBrand(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export type PlaceholderContext = {
  /** Business name of the site (`meta.name`), used for the info@<firma>.com pattern. */
  siteName?: string
  /** Hosts the owner has connected to this site; e-mail on these is the owner's own. */
  ownDomains?: readonly string[]
}

function splitEmail(value: string): { local: string; domain: string } | null {
  const match = value.trim().toLowerCase().match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/)
  return match ? { local: match[1], domain: match[2] } : null
}

function splitDomain(domain: string): { label: string; tld: string } {
  const parts = domain.split('.')
  const tld = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts.slice(-2).join('.') : (parts.at(-1) ?? '')
  const label = parts[parts.length - 1 - tld.split('.').length] ?? parts[0]
  return { label, tld }
}

function isOwnDomain(domain: string, ownDomains: readonly string[] | undefined): boolean {
  return (ownDomains ?? []).some((own) => {
    const host = own.trim().toLowerCase().replace(/^www\./, '')
    return host !== '' && (domain === host || domain.endsWith(`.${host}`))
  })
}

/**
 * True when the e-mail is a known fake: a reserved/template domain, an
 * instruction-like mailbox, or a generic mailbox (info@, iletisim@ ...) on a
 * `.com` named after the business that the owner has not connected to the site.
 */
export function isPlaceholderEmail(value: string | undefined | null, context: PlaceholderContext = {}): boolean {
  const email = splitEmail(value ?? '')
  if (!email) return false
  if (isOwnDomain(email.domain, context.ownDomains)) return false
  const { label, tld } = splitDomain(email.domain)
  if (email.domain === 'example.com' || /(^|\.)example\.(com|org|net|edu)$/.test(email.domain)) return true
  if (PLACEHOLDER_EMAIL_DOMAIN_LABELS.has(label.replace(/-/g, ''))) return true
  if (PLACEHOLDER_EMAIL_LOCAL_PARTS.has(email.local)) return true
  if (context.siteName && GENERIC_MAILBOX_LOCAL_PARTS.has(email.local) && COMPANY_TLDS.has(tld)) {
    const brand = foldBrand(context.siteName)
    return brand.length >= 3 && label.replace(/-/g, '') === brand
  }
  return false
}

/** Words that mark text as filler. "örnek" must stand alone ("Örnek Sk." is a fake, "numune" is not). */
export const PLACEHOLDER_TEXT_PATTERN =
  /(?:^|[^\p{L}\p{N}])(?:örnek|ornek|lorem|ipsum|sample|placeholder|adresiniz|telefonunuz)(?:$|[^\p{L}\p{N}])|your\s+(?:address|phone|email)|address\s+here|xxx+|(?:mahalle|sokak|cadde)\s+ad[ıi]|\b123\s+(?:main|example)\s+st/iu

/** True when an address (or other free text) reads as filler. */
export function isPlaceholderAddress(value: string | undefined | null): boolean {
  const text = (value ?? '').trim()
  return text !== '' && PLACEHOLDER_TEXT_PATTERN.test(text)
}

const PHONE_IN_TEXT = /\+?\d[\d\s().-]{5,}\d/g
const EMAIL_IN_TEXT = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g

/** Phone numbers, e-mails or filler words inside free text (trust line, footer tagline, link label). */
export function isPlaceholderText(value: string | undefined | null, context: PlaceholderContext = {}): boolean {
  const text = (value ?? '').trim()
  if (!text) return false
  if (isPlaceholderAddress(text)) return true
  const emails = text.match(EMAIL_IN_TEXT) ?? []
  if (emails.some((email) => isPlaceholderEmail(email, context))) return true
  const withoutEmails = text.replace(EMAIL_IN_TEXT, ' ')
  return (withoutEmails.match(PHONE_IN_TEXT) ?? []).some((phone) => isPlaceholderPhone(phone))
}

/** `tel:` / `mailto:` hrefs and bare values, for footer links. */
export function isPlaceholderHref(href: string | undefined | null, context: PlaceholderContext = {}): boolean {
  const value = (href ?? '').trim()
  if (/^tel:/i.test(value)) return isPlaceholderPhone(decodeURIComponent(value.slice(4)))
  if (/^mailto:/i.test(value)) return isPlaceholderEmail(value.slice(7).split('?')[0], context)
  return false
}
