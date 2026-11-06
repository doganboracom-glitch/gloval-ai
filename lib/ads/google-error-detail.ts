/**
 * Safe, allow-list based summary of a Google Ads API error response.
 *
 * Only the enum error code (key + value), the field path and a short, redacted message survive. The raw response
 * body, request headers and credentials are never copied, so the result is safe to store, return to the plan owner
 * and show to admins.
 */

export type GoogleErrorDetail = {
  /** errorCode key, e.g. `campaignError`, `policyViolationError`, `stringLengthError`. */
  category: string
  /** errorCode enum value, e.g. `CAMPAIGN_NAME_ALREADY_EXISTS`. */
  value: string
  /** e.g. `mutate_operations[12].ad_group_ad_operation.create.ad.responsive_search_ad.headlines[3]`. */
  fieldPath: string | null
  /** Redacted, at most 200 characters. Only stored for diagnostics; never shown in the admin panel or e-mail. */
  message: string | null
}

export const GOOGLE_ERROR_DETAIL_LIMIT = 10
export const GOOGLE_ERROR_MESSAGE_LIMIT = 200
const FIELD_PATH_LIMIT = 200
const FIELD_PATH_ELEMENT_LIMIT = 12

const CATEGORY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{0,47}$/
const VALUE_PATTERN = /^[A-Z0-9_]{1,80}$/
const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const STATUS_PATTERN = /^[A-Z_]{1,40}$/

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Strips anything that looks like a credential, address or identifier, then truncates. */
export function redactGoogleErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\b(?:authorization|developer[-_ ]?token|login[-_ ]?customer[-_ ]?id|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|api[-_ ]?key)\b\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, '[redacted]')
    .replace(/\bya29\.[\w-]+/g, '[redacted]')
    .replace(/\b1\/\/[\w-]{10,}/g, '[redacted]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\d{6,}/g, '[id]')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.slice(0, GOOGLE_ERROR_MESSAGE_LIMIT)
}

function fieldPathOf(location: unknown): string | null {
  const elements = asRecord(location)?.fieldPathElements
  if (!Array.isArray(elements)) return null
  const parts: string[] = []
  for (const element of elements.slice(0, FIELD_PATH_ELEMENT_LIMIT)) {
    const item = asRecord(element)
    const name = item?.fieldName
    if (typeof name !== 'string' || !FIELD_NAME_PATTERN.test(name)) break
    const index = item?.index
    const hasIndex = typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= 100_000
    parts.push(hasIndex ? `${name}[${index}]` : name)
  }
  if (!parts.length) return null
  return parts.join('.').slice(0, FIELD_PATH_LIMIT)
}

function errorCodeOf(errorCode: unknown): { category: string; value: string } | null {
  const codes = asRecord(errorCode)
  if (!codes) return null
  for (const [category, value] of Object.entries(codes)) {
    if (CATEGORY_PATTERN.test(category) && typeof value === 'string' && VALUE_PATTERN.test(value)) {
      return { category, value }
    }
  }
  return null
}

/** Re-validates an already-extracted list (e.g. read back from jsonb) so nothing unsafe can pass through. */
export function sanitizeGoogleErrorDetails(value: unknown): GoogleErrorDetail[] {
  if (!Array.isArray(value)) return []
  const result: GoogleErrorDetail[] = []
  for (const item of value) {
    const record = asRecord(item)
    if (!record) continue
    const { category, value: code, fieldPath, message } = record
    if (typeof category !== 'string' || !CATEGORY_PATTERN.test(category)) continue
    if (typeof code !== 'string' || !VALUE_PATTERN.test(code)) continue
    const safePath = typeof fieldPath === 'string' && fieldPath.length <= FIELD_PATH_LIMIT &&
      /^[A-Za-z0-9_.[\]]+$/.test(fieldPath)
      ? fieldPath
      : null
    result.push({ category, value: code, fieldPath: safePath, message: redactGoogleErrorMessage(message) })
    if (result.length >= GOOGLE_ERROR_DETAIL_LIMIT) break
  }
  return result
}

/** Extracts a safe summary from a Google Ads REST error payload (`error.details[].errors[]`). */
export function extractGoogleErrorDetails(payload: unknown): GoogleErrorDetail[] {
  const error = asRecord(asRecord(payload)?.error)
  if (!error) return []

  const result: GoogleErrorDetail[] = []
  const details = Array.isArray(error.details) ? error.details : []
  for (const detail of details) {
    const errors = asRecord(detail)?.errors
    if (!Array.isArray(errors)) continue
    for (const entry of errors) {
      const record = asRecord(entry)
      const code = errorCodeOf(record?.errorCode)
      if (!record || !code) continue
      result.push({
        ...code,
        fieldPath: fieldPathOf(record.location),
        message: redactGoogleErrorMessage(record.message),
      })
      if (result.length >= GOOGLE_ERROR_DETAIL_LIMIT) return result
    }
  }
  if (result.length) return result

  const status = typeof error.status === 'string' && STATUS_PATTERN.test(error.status) ? error.status : null
  if (!status) return []
  return [{ category: 'status', value: status, fieldPath: null, message: redactGoogleErrorMessage(error.message) }]
}

function snake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/** Short lowercase code for `ads_actions.failure_reason`, e.g. `google_campaign_error_campaign_name_already_exists`. */
export function googleErrorFailureCode(details: readonly GoogleErrorDetail[], fallback: string): string {
  const first = details[0]
  if (!first) return fallback
  const code = `google_${snake(first.category)}_${first.value.toLowerCase()}`.slice(0, 64).replace(/_+$/, '')
  return /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : fallback
}

/** `categoryEnum @ field.path` one-liners without any free text; used by e-mail and the admin panel. */
export function formatGoogleErrorCode(detail: GoogleErrorDetail): string {
  return `${detail.category}: ${detail.value}`
}

export function summarizeGoogleErrors(details: readonly GoogleErrorDetail[], limit = 3): string {
  return details
    .slice(0, limit)
    .map((detail) => detail.fieldPath ? `${formatGoogleErrorCode(detail)} (${detail.fieldPath})` : formatGoogleErrorCode(detail))
    .join('; ')
}

const VALUE_MESSAGES: Record<string, string> = {
  TOO_LONG: 'Metin izin verilen uzunluğu aşıyor. Başlıkları en çok 30, açıklamaları en çok 90 karakter yapın.',
  TOO_SHORT: 'Metin çok kısa. Başlık veya açıklamayı uzatın.',
  EMPTY: 'Zorunlu bir alan boş bırakılmış.',
  REQUIRED: 'Zorunlu bir alan eksik.',
  DUPLICATE_NAME: 'Bu isimde bir kayıt zaten var. İsmi değiştirip yeniden deneyin.',
  CAMPAIGN_NAME_ALREADY_EXISTS: 'Bu isimde bir kampanya zaten var. Kampanya adını değiştirip yeniden deneyin.',
  CAMPAIGN_BUDGET_NAME_ALREADY_EXISTS: 'Bu isimde bir bütçe zaten var. Yeniden deneyin.',
  DUPLICATE_CAMPAIGN_NAME: 'Bu isimde bir kampanya zaten var. Kampanya adını değiştirip yeniden deneyin.',
  AD_GROUP_NAME_ALREADY_EXISTS: 'Bu isimde bir reklam grubu zaten var. İsmi değiştirip yeniden deneyin.',
  DUPLICATE_ADGROUP_NAME: 'Bu isimde bir reklam grubu zaten var. İsmi değiştirip yeniden deneyin.',
  INVALID_KEYWORD_TEXT: 'Anahtar kelimelerden biri geçersiz. Özel karakterleri ve fazla uzun ifadeleri kaldırın.',
  KEYWORD_TEXT_TOO_LONG: 'Anahtar kelimelerden biri çok uzun. Daha kısa bir ifade kullanın.',
  KEYWORD_HAS_TOO_MANY_WORDS: 'Anahtar kelimelerden biri çok fazla kelime içeriyor. En çok 10 kelime kullanın.',
  INVALID_KEYWORD_CHAR: 'Anahtar kelimelerden biri izin verilmeyen karakter içeriyor.',
  INVALID_URL: 'Hedef URL geçersiz. Tam ve erişilebilir bir adres (https://...) girin.',
  INVALID_FINAL_URL: 'Hedef URL geçersiz. Tam ve erişilebilir bir adres (https://...) girin.',
  INVALID_DESTINATION_URL: 'Hedef URL geçersiz. Tam ve erişilebilir bir adres (https://...) girin.',
  MISSING_URL: 'Hedef URL eksik.',
  UNSUPPORTED_URL_SCHEME: 'Hedef URL https:// ile başlamalıdır.',
  DESTINATION_NOT_WORKING: 'Hedef sayfaya Google erişemiyor. Sitenizin açık olduğundan emin olun.',
  CUSTOMER_NOT_ENABLED: 'Google Ads hesabı etkin değil. Hesabınızı Google Ads panelinden etkinleştirin.',
  CUSTOMER_NOT_FOUND: 'Google Ads hesabı bulunamadı. Bağlantıyı yeniden kurun.',
  BILLING_SETUP_REQUIRED: 'Google Ads hesabında ödeme profili eksik. Ödeme bilgisini Google Ads panelinden tamamlayın.',
  NO_BILLING_SETUP: 'Google Ads hesabında ödeme profili eksik. Ödeme bilgisini Google Ads panelinden tamamlayın.',
  BILLING_ACCOUNT_NOT_APPROVED: 'Google Ads ödeme hesabı henüz onaylanmamış.',
  ACCOUNT_BUDGET_NOT_FOUND: 'Google Ads hesabında bütçe/ödeme bilgisi bulunamadı.',
  PAYMENTS_PROFILE_NOT_FOUND: 'Google Ads hesabında ödeme profili eksik. Ödeme bilgisini Google Ads panelinden tamamlayın.',
  MISSING_EU_POLITICAL_ADVERTISING_DECLARATION: 'AB siyasi reklam beyanı eksik.',
}

const CATEGORY_MESSAGES: Record<string, string> = {
  stringLengthError: 'Bir metin izin verilen uzunluğu aşıyor. Başlıkları en çok 30, açıklamaları en çok 90 karakter yapın.',
  stringFormatError: 'Bir metin geçersiz karakter içeriyor. Özel karakterleri kaldırın.',
  policyViolationError: 'Reklam metni veya hedef site Google politikasını ihlal ediyor. Metni düzenleyin.',
  policyFindingError: 'Reklam metni veya hedef site Google politikasını ihlal ediyor. Metni düzenleyin.',
  adError: 'Reklam metninde bir sorun var. Başlık ve açıklamaları kontrol edin.',
  adGroupAdError: 'Reklam metninde bir sorun var. Başlık ve açıklamaları kontrol edin.',
  criterionError: 'Anahtar kelimelerden biri geçersiz. Anahtar kelime listesini kontrol edin.',
  adGroupCriterionError: 'Anahtar kelimelerden biri geçersiz. Anahtar kelime listesini kontrol edin.',
  campaignCriterionError: 'Hedefleme veya negatif anahtar kelime ayarlarında bir sorun var.',
  urlFieldError: 'Hedef URL geçersiz. Tam ve erişilebilir bir adres (https://...) girin.',
  customerError: 'Google Ads hesabında bir sorun var. Hesap durumunu Google Ads panelinden kontrol edin.',
  billingSetupError: 'Google Ads hesabında ödeme profili eksik. Ödeme bilgisini Google Ads panelinden tamamlayın.',
  authorizationError: 'Bu Google Ads hesabı için yetki yok. Bağlantıyı yeniden kurun.',
  authenticationError: 'Google oturumu geçersiz. Bağlantıyı yeniden kurun.',
  duplicateNameError: 'Bu isimde bir kayıt zaten var. İsmi değiştirip yeniden deneyin.',
  nameError: 'İsim geçersiz veya zaten kullanılıyor. Kampanya adını değiştirin.',
  campaignError: 'Kampanya ayarlarında bir sorun var.',
  campaignBudgetError: 'Bütçe ayarlarında bir sorun var. Günlük bütçeyi kontrol edin.',
  mutateError: 'İstek bir kaynak çakışması nedeniyle reddedildi. Biraz sonra yeniden deneyin.',
}

/** Turkish, plain-language explanation of a Google error code; unknown codes fall back to the raw enum. */
export function explainGoogleError(detail: GoogleErrorDetail): string {
  const fromValue = VALUE_MESSAGES[detail.value]
  if (fromValue) return fromValue
  if (/NAME_ALREADY_EXISTS|DUPLICATE_NAME|DUPLICATE_.*NAME/.test(detail.value)) {
    return 'Bu isimde bir kayıt zaten var. İsmi değiştirip yeniden deneyin.'
  }
  if (/BILLING|PAYMENTS_PROFILE|PAYMENT/.test(detail.value)) {
    return 'Google Ads hesabında ödeme profili eksik. Ödeme bilgisini Google Ads panelinden tamamlayın.'
  }
  const specific = detail.category === 'stringLengthError' || detail.category === 'policyViolationError' ||
    detail.category === 'policyFindingError' || detail.category === 'urlFieldError' ||
    detail.category === 'billingSetupError' || detail.category === 'duplicateNameError'
  if (specific) return CATEGORY_MESSAGES[detail.category]
  return `Google reddetti: ${detail.value}`
}

/** Short field label (`headlines[3]` → `Başlık 4`) for the owner; falls back to the raw path tail. */
export function describeGoogleErrorField(fieldPath: string | null): string | null {
  if (!fieldPath) return null
  const headline = /headlines\[(\d+)\]/.exec(fieldPath)
  if (headline) return `Başlık ${Number(headline[1]) + 1}`
  const description = /descriptions\[(\d+)\]/.exec(fieldPath)
  if (description) return `Açıklama ${Number(description[1]) + 1}`
  if (/final_urls/.test(fieldPath)) return 'Hedef URL'
  if (/keyword/.test(fieldPath)) return 'Anahtar kelime'
  if (/\.name$/.test(fieldPath)) return 'İsim'
  return null
}
