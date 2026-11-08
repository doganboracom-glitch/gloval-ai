/**
 * Phase M2: pure (no I/O) plan model for a paused Meta traffic campaign.
 * Shared by the browser (pre-flight) and the server (which is the one that actually enforces it).
 */
import { createHash } from 'node:crypto'
import { normalizeSiteAddress } from '@/lib/ads/normalize-site-address'

export const META_CTA_OPTIONS = ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_QUOTE'] as const
export type MetaCta = (typeof META_CTA_OPTIONS)[number]

export const META_CTA_LABELS: Record<MetaCta, string> = {
  LEARN_MORE: 'Daha fazla bilgi',
  SHOP_NOW: 'Hemen al',
  SIGN_UP: 'Kaydol',
  CONTACT_US: 'Bize ulaşın',
  GET_QUOTE: 'Teklif al',
}

export const META_OPTIMIZATION_GOALS = ['LANDING_PAGE_VIEWS', 'LINK_CLICKS'] as const
export type MetaOptimizationGoal = (typeof META_OPTIMIZATION_GOALS)[number]
export const META_DEFAULT_URL_TAGS = 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}'

/** Verified short list of ISO 3166-1 alpha-2 codes offered for geo targeting. */
export const META_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'TR', name: 'Türkiye' },
  { code: 'DE', name: 'Almanya' },
  { code: 'GB', name: 'Birleşik Krallık' },
  { code: 'US', name: 'Amerika Birleşik Devletleri' },
  { code: 'FR', name: 'Fransa' },
  { code: 'NL', name: 'Hollanda' },
  { code: 'ES', name: 'İspanya' },
  { code: 'IT', name: 'İtalya' },
  { code: 'AT', name: 'Avusturya' },
  { code: 'CH', name: 'İsviçre' },
  { code: 'BE', name: 'Belçika' },
  { code: 'SE', name: 'İsveç' },
  { code: 'AZ', name: 'Azerbaycan' },
  { code: 'CY', name: 'Kıbrıs' },
  { code: 'AE', name: 'Birleşik Arap Emirlikleri' },
  { code: 'SA', name: 'Suudi Arabistan' },
  { code: 'CA', name: 'Kanada' },
  { code: 'AU', name: 'Avustralya' },
]
const COUNTRY_CODES = new Set(META_COUNTRIES.map((country) => country.code))

export const META_SPECIAL_TOPICS = ['none', 'credit', 'employment', 'housing', 'politics'] as const
export type MetaSpecialTopic = (typeof META_SPECIAL_TOPICS)[number]

export const META_PLAN_LIMITS = {
  name: 80,
  primaryText: 500,
  headline: 80,
  description: 120,
  landingUrl: 1000,
  maxCountries: 10,
  ageMin: 18,
  ageMax: 65,
} as const

export const META_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const META_IMAGE_MIN_WIDTH = 600
export const META_IMAGE_MIN_HEIGHT = 315
/** Width / height range Meta feed placements accept (4:5 portrait up to 1.91:1 landscape). */
export const META_IMAGE_MIN_ASPECT = 0.8
export const META_IMAGE_MAX_ASPECT = 1.91

export type MetaGender = 'all' | 'male' | 'female'

export type MetaPlanContent = {
  name: string
  landingUrl: string
  primaryText: string
  headline: string
  description: string
  cta: MetaCta
  countries: string[]
  ageMin: number
  ageMax: number
  /** Advantage+ treats age selection as guidance; disabling it makes the selected range strict. */
  advantageAudience: boolean
  gender: MetaGender
  optimizationGoal: MetaOptimizationGoal
  utmTracking: boolean
  /** Major currency units of the ad account (e.g. 250.5 TRY). Converted to minor units server-side. */
  dailyBudget: number | string
  /** Optional inclusive end day, `YYYY-MM-DD`. Empty = runs until stopped. */
  endDate: string | null
  /** Private storage path of the uploaded creative (set by the image upload route, never by the client). */
  imagePath: string | null
  /** Display-only original name, set by the image upload route and preserved by plan edits. */
  imageFilename?: string | null
  specialTopic: MetaSpecialTopic
}

export type MetaAgeTargeting = {
  age_min: number
  age_max: number
  age_range?: [number, number]
  targeting_automation: { advantage_audience: 0 | 1 }
}

/** Converts the requested range to Meta's Advantage+ constraints plus an optional preferred range. */
export function metaAgeTargeting(content: Pick<MetaPlanContent, 'ageMin' | 'ageMax' | 'advantageAudience'>): MetaAgeTargeting {
  if (!content.advantageAudience) {
    return {
      age_min: content.ageMin,
      age_max: content.ageMax,
      targeting_automation: { advantage_audience: 0 },
    }
  }

  const hasNarrowerPreference = content.ageMin > 25 || content.ageMax < META_PLAN_LIMITS.ageMax
  return {
    age_min: Math.min(content.ageMin, 25),
    age_max: META_PLAN_LIMITS.ageMax,
    ...(hasNarrowerPreference ? { age_range: [content.ageMin, content.ageMax] as [number, number] } : {}),
    targeting_automation: { advantage_audience: 1 },
  }
}

export function isMetaAgeTargetingValid(content: Pick<MetaPlanContent, 'ageMin' | 'ageMax' | 'advantageAudience'>): boolean {
  const targeting = metaAgeTargeting(content)
  const maxHardMinimum = content.advantageAudience ? 25 : META_PLAN_LIMITS.ageMax
  const range = targeting.age_range
  return (
    Number.isInteger(targeting.age_min) &&
    targeting.age_min >= META_PLAN_LIMITS.ageMin &&
    targeting.age_min <= maxHardMinimum &&
    Number.isInteger(targeting.age_max) &&
    targeting.age_max >= targeting.age_min &&
    targeting.age_max <= META_PLAN_LIMITS.ageMax &&
    (!range || (Number.isInteger(range[0]) && Number.isInteger(range[1]) && range[0] >= META_PLAN_LIMITS.ageMin && range[0] <= range[1] && range[1] <= META_PLAN_LIMITS.ageMax))
  )
}

export type MetaPlanFieldErrors = Partial<Record<keyof MetaPlanContent, string>>

export const META_SPECIAL_TOPIC_MESSAGE =
  'Kredi, istihdam, konut veya siyasi/toplumsal konulardaki reklamlar bu sürümde desteklenmiyor. Bu konular Meta\'da özel reklam kategorisi gerektirir; lütfen Meta Reklam Yöneticisi\'ni kullanın.'

/* ----------------------------- budget ----------------------------- */

/** Currency "offset": how many minor units make one major unit in the Graph API (`daily_budget`). */
const CURRENCY_OFFSET: Record<string, 1 | 100> = {
  TRY: 100, USD: 100, EUR: 100, GBP: 100, AED: 100, SAR: 100, AZN: 100, CAD: 100, AUD: 100, CHF: 100, SEK: 100,
  JPY: 1, KRW: 1, VND: 1, CLP: 1, ISK: 1,
}

export function metaCurrencyOffset(currency: string | null | undefined): 1 | 100 | null {
  if (!currency) return null
  return CURRENCY_OFFSET[currency.toUpperCase()] ?? null
}

export type BudgetResult =
  | { ok: true; minor: number }
  | { ok: false; error: 'currency_unsupported' | 'invalid_amount' | 'too_many_decimals' | 'amount_too_small' }

/** Exact decimal-string conversion (no float math), so 1.005 / 0.1 + 0.2 style drift cannot change the budget. */
export function dailyBudgetToMinor(amount: number | string, currency: string | null | undefined): BudgetResult {
  const offset = metaCurrencyOffset(currency)
  if (!offset) return { ok: false, error: 'currency_unsupported' }
  const text = (typeof amount === 'number' ? (Number.isFinite(amount) ? String(amount) : '') : String(amount ?? '')).trim().replace(',', '.')
  const match = /^(\d{1,12})(?:\.(\d{1,8}))?$/.exec(text)
  if (!match) return { ok: false, error: 'invalid_amount' }
  const decimals = offset === 100 ? 2 : 0
  const fraction = (match[2] ?? '')
  const extra = fraction.slice(decimals)
  if (/[1-9]/.test(extra)) return { ok: false, error: 'too_many_decimals' }
  const minorFraction = decimals === 0 ? 0 : Number(fraction.slice(0, decimals).padEnd(decimals, '0'))
  const minor = Number(match[1]) * offset + minorFraction
  if (!Number.isSafeInteger(minor)) return { ok: false, error: 'invalid_amount' }
  if (minor <= 0) return { ok: false, error: 'amount_too_small' }
  return { ok: true, minor }
}

/* ----------------------------- url ----------------------------- */

export type UrlResult = { ok: true; url: string } | { ok: false; error: string }

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/

export function validateLandingUrl(value: unknown): UrlResult {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'Açılış adresi gerekli.' }
  const raw = value.trim()
  if (raw.length > META_PLAN_LIMITS.landingUrl) return { ok: false, error: 'Açılış adresi çok uzun.' }
  if (/\s/.test(raw)) return { ok: false, error: 'Açılış adresi geçersiz.' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, error: 'Açılış adresi geçersiz. https:// ile başlayan tam adres girin.' }
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'Açılış adresi https:// ile başlamalı.' }
  if (parsed.username || parsed.password) return { ok: false, error: 'Açılış adresinde kullanıcı bilgisi bulunamaz.' }
  if (parsed.port) return { ok: false, error: 'Açılış adresinde özel port kullanılamaz.' }
  const host = parsed.hostname.toLowerCase()
  if (host.startsWith('[') || host.includes(':') || IPV4_LITERAL.test(host) || /^\d+$/.test(host.replace(/\./g, ''))) {
    return { ok: false, error: 'Açılış adresi bir alan adı olmalı; IP adresleri kabul edilmez.' }
  }
  const site = normalizeSiteAddress(host)
  if (!site.ok || !host.includes('.')) return { ok: false, error: 'Açılış adresi herkese açık bir alan adı olmalı.' }
  parsed.hash = ''
  return { ok: true, url: parsed.toString() }
}

/* ----------------------------- content ----------------------------- */

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max + 1) : ''
}

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export type ValidatedPlan = {
  content: MetaPlanContent
  dailyBudgetMinor: number
}

export function validateMetaPlanContent(
  input: unknown,
  options: { currency: string | null; now?: Date; requireImage?: boolean; minimumBudgetMinor?: number | null },
): { ok: true; value: ValidatedPlan } | { ok: false; errors: MetaPlanFieldErrors } {
  const errors: MetaPlanFieldErrors = {}
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const now = options.now ?? new Date()

  const name = text(raw.name, META_PLAN_LIMITS.name)
  if (!name) errors.name = 'Kampanya adı gerekli.'
  else if (name.length > META_PLAN_LIMITS.name) errors.name = `Kampanya adı en fazla ${META_PLAN_LIMITS.name} karakter olabilir.`

  const url = validateLandingUrl(raw.landingUrl)
  if (!url.ok) errors.landingUrl = url.error

  const primaryText = text(raw.primaryText, META_PLAN_LIMITS.primaryText)
  if (!primaryText) errors.primaryText = 'Ana metin gerekli.'
  else if (primaryText.length > META_PLAN_LIMITS.primaryText) errors.primaryText = `Ana metin en fazla ${META_PLAN_LIMITS.primaryText} karakter olabilir.`

  const headline = text(raw.headline, META_PLAN_LIMITS.headline)
  if (!headline) errors.headline = 'Başlık gerekli.'
  else if (headline.length > META_PLAN_LIMITS.headline) errors.headline = `Başlık en fazla ${META_PLAN_LIMITS.headline} karakter olabilir.`

  const description = text(raw.description, META_PLAN_LIMITS.description)
  if (description.length > META_PLAN_LIMITS.description) errors.description = `Açıklama en fazla ${META_PLAN_LIMITS.description} karakter olabilir.`

  const cta = (META_CTA_OPTIONS as readonly string[]).includes(String(raw.cta)) ? (raw.cta as MetaCta) : null
  if (!cta) errors.cta = 'Geçerli bir eylem çağrısı seçin.'

  const countries = Array.isArray(raw.countries)
    ? [...new Set(raw.countries.filter((c): c is string => typeof c === 'string').map((c) => c.toUpperCase()))]
    : []
  if (countries.length === 0) errors.countries = 'En az bir ülke seçin.'
  else if (countries.length > META_PLAN_LIMITS.maxCountries) errors.countries = `En fazla ${META_PLAN_LIMITS.maxCountries} ülke seçilebilir.`
  else if (countries.some((c) => !COUNTRY_CODES.has(c))) errors.countries = 'Listede olmayan bir ülke seçildi.'

  const ageMin = Number(raw.ageMin)
  const ageMax = Number(raw.ageMax)
  const advantageAudience = raw.advantageAudience !== false
  if (!Number.isInteger(ageMin) || ageMin < META_PLAN_LIMITS.ageMin || ageMin > META_PLAN_LIMITS.ageMax) {
    errors.ageMin = 'Alt yaş 18 ile 65 arasında olmalı.'
  } else if (!Number.isInteger(ageMax) || ageMax < ageMin || ageMax > META_PLAN_LIMITS.ageMax) {
    errors.ageMax = 'Üst yaş, alt yaştan küçük olamaz ve en fazla 65 olabilir.'
  }
  if (!isMetaAgeTargetingValid({ ageMin, ageMax, advantageAudience }) && !errors.ageMin && !errors.ageMax) {
    errors.ageMin = 'Meta için yaş sınırları geçersiz. Advantage+ alt sınırı en fazla 25, üst sınırı en fazla 65 olabilir.'
  }

  const gender: MetaGender = raw.gender === 'male' || raw.gender === 'female' ? raw.gender : 'all'
  const optimizationGoal = (META_OPTIMIZATION_GOALS as readonly string[]).includes(String(raw.optimizationGoal ?? 'LANDING_PAGE_VIEWS'))
    ? ((raw.optimizationGoal ?? 'LANDING_PAGE_VIEWS') as MetaOptimizationGoal)
    : 'LANDING_PAGE_VIEWS'
  if (raw.optimizationGoal !== undefined && !(META_OPTIMIZATION_GOALS as readonly string[]).includes(String(raw.optimizationGoal))) {
    errors.optimizationGoal = 'Geçerli bir optimizasyon hedefi seçin.'
  }
  const utmTracking = raw.utmTracking !== false

  const budget = dailyBudgetToMinor(raw.dailyBudget as number | string, options.currency)
  if (!budget.ok) {
    errors.dailyBudget = {
      currency_unsupported: 'Bu reklam hesabının para birimi henüz desteklenmiyor.',
      invalid_amount: 'Geçerli bir günlük bütçe girin.',
      too_many_decimals: 'Bu para biriminde bütçe en fazla 2 ondalık (JPY/KRW gibi para birimlerinde ondalıksız) olabilir.',
      amount_too_small: 'Günlük bütçe sıfırdan büyük olmalı.',
    }[budget.error]
  } else if (
    typeof options.minimumBudgetMinor === 'number' &&
    Number.isSafeInteger(options.minimumBudgetMinor) &&
    options.minimumBudgetMinor > 0 &&
    budget.minor < options.minimumBudgetMinor
  ) {
    const offset = metaCurrencyOffset(options.currency) ?? 100
    const formattedMinimum = (options.minimumBudgetMinor / offset).toLocaleString('tr-TR', {
      minimumFractionDigits: offset === 100 ? 2 : 0,
      maximumFractionDigits: offset === 100 ? 2 : 0,
    })
    errors.dailyBudget = `Bu reklam hesabı için Meta'nın minimum günlük bütçesi ${formattedMinimum} ${options.currency}.`
  }

  let endDate: string | null = null
  if (typeof raw.endDate === 'string' && raw.endDate.trim()) {
    const value = raw.endDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      errors.endDate = 'Bitiş tarihi geçersiz.'
    } else if (value < todayIso(now)) {
      errors.endDate = 'Bitiş tarihi geçmişte olamaz.'
    } else {
      endDate = value
    }
  }

  const specialTopic = (META_SPECIAL_TOPICS as readonly string[]).includes(String(raw.specialTopic ?? 'none'))
    ? ((raw.specialTopic ?? 'none') as MetaSpecialTopic)
    : 'none'
  if (specialTopic !== 'none') errors.specialTopic = META_SPECIAL_TOPIC_MESSAGE

  const imagePath = typeof raw.imagePath === 'string' && raw.imagePath ? raw.imagePath : null
  if (options.requireImage && !imagePath) errors.imagePath = 'Reklam görseli yükleyin.'

  if (Object.keys(errors).length > 0 || !url.ok || !cta || !budget.ok) return { ok: false, errors }
  return {
    ok: true,
    value: {
      dailyBudgetMinor: budget.minor,
      content: {
        name, landingUrl: url.url, primaryText, headline, description, cta, countries, ageMin, ageMax, advantageAudience, gender,
        dailyBudget: typeof raw.dailyBudget === 'number' ? raw.dailyBudget : String(raw.dailyBudget).trim(),
        optimizationGoal, utmTracking,
        endDate, imagePath, imageFilename: null, specialTopic,
      },
    },
  }
}

/* ----------------------------- image ----------------------------- */

export type ImageCheck =
  | { ok: true; format: 'jpg' | 'png'; width: number; height: number }
  | { ok: false; error: 'empty' | 'too_large' | 'unsupported_type' | 'unreadable' | 'too_small' | 'bad_aspect' }

export const META_IMAGE_ERROR_MESSAGES: Record<Exclude<ImageCheck, { ok: true }>['error'], string> = {
  empty: 'Görsel dosyası boş.',
  too_large: 'Görsel en fazla 5 MB olabilir.',
  unsupported_type: 'Yalnızca JPG veya PNG görsel yüklenebilir.',
  unreadable: 'Görsel boyutları okunamadı; dosya bozuk olabilir.',
  too_small: `Görsel en az ${META_IMAGE_MIN_WIDTH}x${META_IMAGE_MIN_HEIGHT} piksel olmalı.`,
  bad_aspect: 'Görselin en-boy oranı 4:5 (dikey) ile 1.91:1 (yatay) arasında olmalı.',
}

function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    if (marker === 0xff) { offset += 1; continue }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] }
    }
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

/** Real format is sniffed from magic bytes (a declared MIME type is never trusted); WebP is refused in M2. */
export function inspectMetaImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: 'empty' }
  if (bytes.length > META_IMAGE_MAX_BYTES) return { ok: false, error: 'too_large' }
  const isJpeg = bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes.length > 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  if (!isJpeg && !isPng) return { ok: false, error: 'unsupported_type' }
  const size = isPng ? readPngSize(bytes) : readJpegSize(bytes)
  if (!size || size.width <= 0 || size.height <= 0 || size.width > 20_000 || size.height > 20_000) {
    return { ok: false, error: 'unreadable' }
  }
  if (size.width < META_IMAGE_MIN_WIDTH || size.height < META_IMAGE_MIN_HEIGHT) return { ok: false, error: 'too_small' }
  const aspect = size.width / size.height
  if (aspect < META_IMAGE_MIN_ASPECT || aspect > META_IMAGE_MAX_ASPECT) return { ok: false, error: 'bad_aspect' }
  return { ok: true, format: isPng ? 'png' : 'jpg', ...size }
}

export function metaImagePathPattern(userId: string): RegExp {
  return new RegExp(`^${userId.replace(/[^0-9a-f-]/gi, '')}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg)$`)
}

/* ----------------------------- request tag + payloads ----------------------------- */

/** Short code appended to every Meta object name so a retry can find objects it already created. */
export function metaRequestTag(requestId: string): string {
  return `gloval-req-${requestId.replace(/-/g, '').toLowerCase().slice(0, 12)}`
}

export function taggedName(name: string, tag: string, suffix = ''): string {
  const base = name.slice(0, 60)
  return `${base}${suffix} [${tag}]`
}

export const VALIDATE_ONLY = JSON.stringify(['validate_only'])

export function buildCampaignForm(input: { name: string; tag: string; apiVersion: string; validateOnly?: boolean }): Record<string, string> {
  const form: Record<string, string> = {
    name: taggedName(input.name, input.tag),
    objective: 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    // Always empty: special ad categories are rejected up front, never published.
    special_ad_categories: '[]',
    buying_type: 'AUCTION',
  }
  const major = Number(/^v(\d+)/.exec(input.apiVersion)?.[1] ?? 0)
  // Budget lives on the ad set, so campaign-level budget sharing is explicitly off (field exists from v22).
  if (major >= 22) form.is_adset_budget_sharing_enabled = 'false'
  if (input.validateOnly) form.execution_options = VALIDATE_ONLY
  return form
}

export function buildAdSetForm(input: {
  content: MetaPlanContent
  dailyBudgetMinor: number
  campaignId: string
  tag: string
  hasInstagram: boolean
  validateOnly?: boolean
}): Record<string, string> {
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.content.countries },
    ...metaAgeTargeting(input.content),
  }
  if (input.content.gender === 'male') targeting.genders = [1]
  if (input.content.gender === 'female') targeting.genders = [2]
  // Without a linked Instagram account only Facebook placements can carry the creative.
  if (!input.hasInstagram) targeting.publisher_platforms = ['facebook']

  const form: Record<string, string> = {
    name: taggedName(input.content.name, input.tag, ' - Reklam seti'),
    campaign_id: input.campaignId,
    status: 'PAUSED',
    daily_budget: String(input.dailyBudgetMinor),
    billing_event: 'IMPRESSIONS',
    optimization_goal: input.content.optimizationGoal ?? 'LANDING_PAGE_VIEWS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    targeting: JSON.stringify(targeting),
  }
  if (input.content.endDate) form.end_time = `${input.content.endDate}T23:59:59+0000`
  if (input.validateOnly) form.execution_options = VALIDATE_ONLY
  return form
}

export function buildAdImageForm(input: { bytes: Uint8Array; filename: string }): Record<string, string> {
  return { bytes: Buffer.from(input.bytes).toString('base64'), name: input.filename.slice(0, 80) }
}

export function buildCreativeForm(input: {
  content: MetaPlanContent
  pageId: string
  instagramAccountId: string | null
  imageHash: string
  tag: string
  validateOnly?: boolean
}): Record<string, string> {
  const linkData: Record<string, unknown> = {
    image_hash: input.imageHash,
    link: input.content.landingUrl,
    message: input.content.primaryText,
    name: input.content.headline,
    call_to_action: { type: input.content.cta, value: { link: input.content.landingUrl } },
  }
  if (input.content.description) linkData.description = input.content.description
  const spec: Record<string, unknown> = { page_id: input.pageId, link_data: linkData }
  if (input.instagramAccountId) spec.instagram_user_id = input.instagramAccountId
  const form: Record<string, string> = {
    name: taggedName(input.content.name, input.tag, ' - Kreatif'),
    object_story_spec: JSON.stringify(spec),
  }
  if (input.content.utmTracking !== false) form.url_tags = META_DEFAULT_URL_TAGS
  if (input.validateOnly) form.execution_options = VALIDATE_ONLY
  return form
}

export function buildAdForm(input: {
  content: MetaPlanContent
  adSetId: string
  creativeId: string
  tag: string
  validateOnly?: boolean
}): Record<string, string> {
  const form: Record<string, string> = {
    name: taggedName(input.content.name, input.tag, ' - Reklam'),
    adset_id: input.adSetId,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    status: 'PAUSED',
  }
  if (input.validateOnly) form.execution_options = VALIDATE_ONLY
  return form
}

/** Hash that binds an approval to the exact content the user saw. */
export function metaPlanHash(content: MetaPlanContent, extra: { connectionId: string; currency: string | null; imageSha?: string | null }): string {
  const canonical = JSON.stringify([
    content.name, content.landingUrl, content.primaryText, content.headline, content.description, content.cta,
    [...content.countries].sort(), content.ageMin, content.ageMax, content.advantageAudience, content.gender, String(content.dailyBudget),
    content.optimizationGoal ?? 'LANDING_PAGE_VIEWS', content.utmTracking !== false,
    content.endDate, content.imagePath, extra.connectionId, extra.currency, extra.imageSha ?? null,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}

export const META_APPROVAL_TEXT =
  'Bu kampanyanın Meta reklam hesabımda DURAKLATILMIŞ olarak oluşturulmasını onaylıyorum. Kampanya, siz Meta Reklam Yöneticisi\'nden başlatana kadar harcama yapmaz. Günlük bütçe ve reklam metni yukarıda gördüğüm gibidir.'

export function metaApprovalText(content: MetaPlanContent, lang: 'tr' | 'en'): string {
  const goal = content.optimizationGoal ?? 'LANDING_PAGE_VIEWS'
  const goalLabel = lang === 'tr'
    ? goal === 'LANDING_PAGE_VIEWS' ? 'yönlendirme sayfası görüntülemeleri' : 'bağlantı tıklamaları'
    : goal === 'LANDING_PAGE_VIEWS' ? 'landing page views' : 'link clicks'
  const pixelNote = goal === 'LANDING_PAGE_VIEWS'
    ? lang === 'tr' ? ' Sitede Meta Pixel kurulu olmalıdır.' : ' A Meta Pixel must be installed on the website.'
    : ''
  const trackingNote = content.utmTracking !== false
    ? lang === 'tr' ? ' UTM etiketleri hedef bağlantıya eklenir.' : ' UTM tags are appended to the destination link.'
    : lang === 'tr' ? ' UTM etiketleri kapalıdır.' : ' UTM tags are disabled.'

  return lang === 'tr'
    ? `Bu plan ${goalLabel} hedefiyle Meta hesabınızda DURAKLATILMIŞ olarak oluşturulacaktır. Kampanya Meta Reklam Yöneticisi’nden başlatılana kadar harcama yapmaz.${pixelNote}${trackingNote} Günlük bütçe, hedef sayfa ve reklam metni yukarıda gördüğünüz gibidir.`
    : `This plan will be created PAUSED in your Meta account with the ${goalLabel} goal. It will not spend until started in Meta Ads Manager.${pixelNote}${trackingNote} The daily budget, destination URL and ad copy are shown above.`
}

export const META_APPROVAL_VERSION = 1

export function adsManagerUrl(accountId: string, campaignId: string): string {
  const act = accountId.replace(/^act_/, '')
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(act)}&selected_campaign_ids=${encodeURIComponent(campaignId)}`
}
