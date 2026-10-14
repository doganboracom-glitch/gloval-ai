/**
 * Shared (client + server) rules for the published-site contact form.
 * Pure: no IO, so the same limits drive the browser hints and the server check.
 */

export const CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  emailMax: 254,
  phoneMax: 20,
  messageMin: 10,
  messageMax: 2000,
} as const

/** A submission arriving sooner than this after the page was rendered is a bot. */
export const CONTACT_MIN_FILL_MS = 3_000
/** A form token older than this is rejected; the visitor just reloads the page. */
export const CONTACT_TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000

export const CONTACT_RATE = {
  perMinute: 3,
  perHour: 10,
  siteDaily: 50,
} as const

/** How long visitor messages are kept before the daily sweep deletes them. */
export const CONTACT_RETENTION_DAYS = 180

/** Name of the decoy input a human never sees or fills. */
export const CONTACT_HONEYPOT_FIELD = 'website'

export type ContactField = 'name' | 'email' | 'phone' | 'message' | 'consent'
export type ContactFieldError = 'required' | 'too_short' | 'too_long' | 'invalid' | 'html'
export type ContactFieldErrors = Partial<Record<ContactField, ContactFieldError>>

export type ContactInput = {
  name: string
  email: string
  phone: string | null
  message: string
}

export type ContactValidation =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: ContactFieldErrors }

// Control characters other than tab/newline never belong in a form message.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
// Any tag-like sequence: "<b", "</p", "<!--", "<?xml". A lone "<" in prose (e.g. "3 < 5") stays legal.
const HTML_LIKE = /<\s*[a-z!/?]/i
const EMAIL_RE = /^[^\s@<>"',;:\\()[\]]+@[^\s@<>"',;:\\()[\]]+\.[^\s@<>"',;:\\()[\]]{2,}$/i
const PHONE_RE = /^\+?[0-9\s().-]+$/

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function cleanSingleLine(value: unknown): string {
  return asText(value).replace(CONTROL_CHARS, '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanMessage(value: unknown): string {
  return asText(value)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isValidContactEmail(value: string): boolean {
  return value.length <= CONTACT_LIMITS.emailMax && EMAIL_RE.test(value)
}

/** Trims, normalizes and checks one submission. Never trusts the client's own checks. */
export function validateContactInput(raw: unknown): ContactValidation {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: ContactFieldErrors = {}

  const name = cleanSingleLine(body.name)
  if (!name) errors.name = 'required'
  else if (HTML_LIKE.test(name)) errors.name = 'html'
  else if (name.length < CONTACT_LIMITS.nameMin) errors.name = 'too_short'
  else if (name.length > CONTACT_LIMITS.nameMax) errors.name = 'too_long'

  const email = cleanSingleLine(body.email).toLowerCase()
  if (!email) errors.email = 'required'
  else if (!isValidContactEmail(email)) errors.email = 'invalid'

  const phoneRaw = cleanSingleLine(body.phone)
  let phone: string | null = null
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, '')
    if (phoneRaw.length > CONTACT_LIMITS.phoneMax) errors.phone = 'too_long'
    else if (!PHONE_RE.test(phoneRaw) || digits.length < 7 || digits.length > 15) errors.phone = 'invalid'
    else phone = phoneRaw
  }

  const message = cleanMessage(body.message)
  if (!message) errors.message = 'required'
  else if (HTML_LIKE.test(message)) errors.message = 'html'
  else if (message.length < CONTACT_LIMITS.messageMin) errors.message = 'too_short'
  else if (message.length > CONTACT_LIMITS.messageMax) errors.message = 'too_long'

  // The KVKK checkbox must be an explicit boolean true; truthy strings do not count.
  if (body.consent !== true) errors.consent = 'required'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, email, phone, message } }
}

/**
 * Which visible inputs the section shows. Name, e-mail and message are always
 * there; phone appears only when the owner added a phone-like label. Labels the
 * owner typed are reused, anything else falls back to the language default.
 */
export type ContactFormLayout = {
  name: string
  email: string
  phone: string | null
  message: string
}

export function resolveContactFormLayout(
  labels: readonly string[] | undefined,
  lang: string,
): ContactFormLayout {
  const tr = lang === 'tr'
  const list = (labels ?? []).map((l) => l.trim()).filter(Boolean)
  const find = (re: RegExp) => list.find((l) => re.test(l))
  return {
    name: find(/name|ad\b|ad[ıi]|isim|soyad/i) ?? (tr ? 'Ad Soyad' : 'Name'),
    email: find(/e-?mail|e-?posta|mail/i) ?? (tr ? 'E-posta' : 'Email'),
    phone: find(/phone|telefon|gsm|tel\b/i) ?? null,
    message: find(/message|mesaj/i) ?? (tr ? 'Mesaj' : 'Message'),
  }
}

/** What the form can tell the visitor when a submission fails. */
export type ContactSubmitError =
  | 'too_fast'
  | 'rate_limited'
  | 'expired'
  | 'invalid_token'
  | 'unknown_site'
  | 'too_large'
  | 'server'
  | 'network'

const SUBMIT_ERRORS: readonly ContactSubmitError[] = [
  'too_fast',
  'rate_limited',
  'expired',
  'invalid_token',
  'unknown_site',
  'too_large',
  'server',
]

/** Maps the API's `{ error }` code (or a failed request) to a message key. Unknown shapes count as a server error. */
export function resolveContactSubmitError(body: unknown): ContactSubmitError {
  const code = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined
  return SUBMIT_ERRORS.find((known) => known === code) ?? 'server'
}

export type ContactFormCopy = {
  send: string
  sending: string
  success: string
  genericError: string
  submitErrors: Record<ContactSubmitError, string>
  previewNote: string
  consentLead: string
  consentLink: string
  consentTail: string
  consentPlatformLink: string
  honeypotLabel: string
  errors: Record<ContactFieldError, string>
  consentRequired: string
}

export function contactFormCopy(lang: string): ContactFormCopy {
  if (lang === 'tr') {
    return {
      send: 'Gönder',
      sending: 'Gönderiliyor…',
      success: 'Mesajınız alındı. En kısa sürede size dönüş yapılacak.',
      genericError: 'Mesajınız şu an gönderilemedi. Lütfen daha sonra tekrar deneyin.',
      submitErrors: {
        too_fast: 'Form çok hızlı gönderildi. Birkaç saniye bekleyip tekrar deneyin.',
        rate_limited: 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.',
        expired: 'Formun süresi doldu. Sayfayı yenileyip tekrar deneyin.',
        invalid_token: 'Form doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
        unknown_site: 'Bu site şu an mesaj kabul etmiyor.',
        too_large: 'Mesajınız çok uzun. Lütfen kısaltıp tekrar deneyin.',
        server: 'Sunucu hatası: mesajınız kaydedilemedi. Lütfen daha sonra tekrar deneyin.',
        network: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      },
      previewNote: 'Önizlemede gönderilmez.',
      consentLead: 'Kişisel verilerimin işlenmesi hakkında ',
      consentLink: 'Aydınlatma Metni',
      consentTail: "'ni okudum.",
      consentPlatformLink: 'Aydınlatma Metni',
      honeypotLabel: 'Bu alanı boş bırakın',
      consentRequired: 'Devam etmek için Aydınlatma Metni onayı gerekli.',
      errors: {
        required: 'Bu alan zorunlu.',
        too_short: 'Çok kısa.',
        too_long: 'Çok uzun.',
        invalid: 'Geçerli bir değer girin.',
        html: 'Yalnızca düz metin girin.',
      },
    }
  }
  return {
    send: 'Send',
    sending: 'Sending…',
    success: 'Your message has been received. We will get back to you soon.',
    genericError: 'Your message could not be sent right now. Please try again later.',
    submitErrors: {
      too_fast: 'The form was sent too quickly. Wait a few seconds and try again.',
      rate_limited: 'Too many attempts. Please try again in a while.',
      expired: 'The form has expired. Reload the page and try again.',
      invalid_token: 'The form could not be verified. Reload the page and try again.',
      unknown_site: 'This site is not accepting messages right now.',
      too_large: 'Your message is too long. Please shorten it and try again.',
      server: 'Server error: your message could not be saved. Please try again later.',
      network: 'Could not connect. Check your internet connection and try again.',
    },
    previewNote: 'Not sent in preview.',
    consentLead: 'I have read the ',
    consentLink: 'Privacy Notice',
    consentTail: ' on how my personal data is processed.',
    consentPlatformLink: 'Privacy Notice',
    honeypotLabel: 'Leave this field empty',
    consentRequired: 'Please accept the notice to continue.',
    errors: {
      required: 'This field is required.',
      too_short: 'Too short.',
      too_long: 'Too long.',
      invalid: 'Enter a valid value.',
      html: 'Plain text only.',
    },
  }
}
