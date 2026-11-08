import { META_APP_NOT_LIVE_MESSAGE, redactMetaErrorMessage } from '@/lib/ads/meta-error-detail'
import { META_STEP_LABELS } from '@/lib/ads/meta-publish-errors'
import { metaPlanStatusView } from '@/lib/ads/meta-plan-status'

/** Client-safe helpers behind the Meta publish panel: error copy, form field order, stepper and partial-result state. */

export type MetaApiError = {
  ok: false
  error: string
  message?: string
  metaReason?: string | null
  fieldErrors?: Record<string, string>
  blocked?: string[]
  step?: string
  stepLabel?: string
}

export type MetaUserError = { message: string; detail: string | null }

const DETAIL_MAX = 140

export const META_ERROR_MESSAGES: Record<string, string> = {
  app_not_live: META_APP_NOT_LIVE_MESSAGE,
  page_required: 'Meta, bağlı Facebook Sayfası veya Instagram hesabı için reklam erişimini reddetti. Meta Business Suite’te Sayfa erişimi ve reklam yetkisini; Instagram yerleşimi kullanılıyorsa profesyonel hesabın aynı Sayfaya bağlı olduğunu kontrol edin.',
  advertiser_verification_required: 'Meta reklamveren, işletme veya kimlik doğrulaması istiyor. Meta Business Support Home > Hesap Kalitesi bölümündeki adımları tamamlayıp yeniden deneyin.',
  publish_permission_missing: 'Meta reklam yönetimi iznini reddetti. Meta Business Ayarları’nda reklam hesabı kampanya yetkisini ve gerekli reklam yönetimi izinlerini doğrulayın.',
  reauth_required: 'Meta erişimi sona ermiş. Ayarlar sekmesinden hesabı yeniden bağlayın.',
  network_error: 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',
  rate_limited: 'Çok fazla deneme yaptınız. Birkaç dakika sonra tekrar deneyin.',
  csrf_failed: 'Oturum doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
  invalid_request: 'İstek geçersiz. Sayfayı yenileyip tekrar deneyin.',
  plan_not_found: 'Plan bulunamadı. Sayfayı yenileyin.',
  plan_not_approved: 'Plan onaylı değil. Önce Meta ile doğrulayıp onaylayın.',
  plan_changed: 'Plan onaydan sonra değişti. Yeniden doğrulayıp onaylayın.',
  plan_invalid: 'Plandaki bazı alanlar geçersiz. İşaretli alanları düzeltin.',
  validation_required: 'Önce planı Meta ile doğrulayın.',
  terms_not_accepted: 'Devam etmek için onay kutusunu işaretleyin.',
  publish_in_progress: 'Yayın şu anda sürüyor. Birkaç saniye sonra yenileyin.',
  publish_quota_exceeded: 'Günlük yayın deneme limitine ulaşıldı. Yarın tekrar deneyin.',
  insufficient_credits: 'Yayınlamak için en az 15 AI krediniz olmalı. Yeterli kredi olmadığından Meta’da hiçbir nesne oluşturulmadı ve kredi düşmedi. Kredi satın alıp tekrar deneyin.',
  payment_method_missing: 'Meta reklam hesabında ödeme yöntemi tanımlı değil. Meta Reklam Yöneticisi\'nden ekleyin.',
  account_restricted: 'Meta reklam hesabı kısıtlı veya devre dışı. Meta Business Support Home > Hesap Kalitesi bölümünde kısıtlamaları ve ödeme durumunu kontrol edin.',
  image_invalid: 'Görsel geçersiz. JPG veya PNG, en çok 5 MB bir görsel yükleyin.',
  age_range_not_allowed: 'Meta Advantage+ kitle, en çok yaşın 65 olmasını ister. Yaş aralığını 18-65 yapın.',
  dsa_info_required: 'AB ülkeleri için ek bilgi gerekiyor, yakında. Şimdilik AB/AEA ülkelerini hedeften çıkarın.',
  ad_creation_access_missing: 'Seçili Facebook Sayfası için reklam oluşturma yetkiniz yok. Meta Business Suite > Sayfa erişimi bölümünde Reklam (ADVERTISE) veya Reklam oluşturma (CREATE_ADS) görevini verin.',
  creative_unavailable: 'Oluşturulan reklam kreatifine erişilemiyor. Meta hesabı ve Sayfa erişimini kontrol edip tekrar deneyin.',
  policy_blocked: 'Reklam metni izin verilmeyen bir ifade içeriyor.',
  kill_switch_active: 'Meta işlemleri geçici olarak durduruldu.',
  provider_error: 'Meta şu anda yanıt vermiyor. Biraz sonra tekrar deneyin.',
  meta_plan_active: 'Plan Meta’da hâlâ etkin. Önce Reklam Yöneticisi’nde duraklatın; plan kaldırılmadı.',
  meta_inactive_unconfirmed: 'Meta’da kampanyanın etkin olmadığını doğrulayamadık. Nesne silinmiş veya erişilemez olabilir; plan kaldırılmadı.',
  meta_plan_busy: 'Plan üzerinde başka bir işlem sürüyor. İşlem bitince tekrar deneyin.',
  meta_confirmation_required: 'Meta plan durumu doğrulanamadı. Plan kaldırılmadı; yeniden deneyin.',
}

/** Masked and shortened: raw Meta text is only ever shown inside a collapsed technical-details section. */
export function shortenMetaDetail(value: unknown, max = DETAIL_MAX): string | null {
  const redacted = redactMetaErrorMessage(value)
  if (!redacted) return null
  const flat = redacted
    .replace(/\(#\d+\)/g, '')
    .replace(/\b(?:error[_ ]?code|code)\s*[:=]?\s*\d+\b/gi, '')
    .replace(/\b(?:error[_ ]?subcode|subcode)\s*[:=]?\s*1870189\b/gi, '')
    .replace(/\b1870189\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Publish credit rule shown in the approval summary (same rule as Google Ads). */
export const META_PUBLISH_CREDIT_COST = 15

export type MetaCreditInfo = { balance: number; reserved: number; available: number; cost: number }
export type MetaCreditState = 'charged' | 'already_charged' | 'charge_pending' | 'released' | 'no_reservation' | 'none'

export function metaCreditSummaryText(lang: 'tr' | 'en', cost = META_PUBLISH_CREDIT_COST): string {
  return lang === 'tr'
    ? `Başarılı yayında ${cost} AI kredisi düşer; yayın başarısız olursa düşmez.`
    : `${cost} AI credits are charged on a successful publish; nothing is charged if the publish fails.`
}

export function metaCreditBalanceText(lang: 'tr' | 'en', info: MetaCreditInfo | null): string | null {
  if (!info) return null
  if (lang === 'tr') {
    return info.reserved > 0
      ? `Mevcut bakiye: ${info.balance} kredi (${info.reserved} kredi açık yayın için ayrıldı, kullanılabilir: ${info.available}).`
      : `Mevcut bakiye: ${info.balance} kredi.`
  }
  return info.reserved > 0
    ? `Current balance: ${info.balance} credits (${info.reserved} held for open publishes, spendable: ${info.available}).`
    : `Current balance: ${info.balance} credits.`
}

export function metaCreditsInsufficient(info: MetaCreditInfo | null): boolean {
  return info !== null && info.available < info.cost
}

/** Warning shown after a publish that succeeded but whose credit charge did not go through yet. */
export function metaCreditStateNotice(state: string | null | undefined): string | null {
  if (state === 'charge_pending') {
    return 'Kampanya oluşturuldu ancak 15 kredilik ücret şu an düşülemedi. Yayınınız geri alınmadı; krediniz yeterli olduğunda ücret otomatik olarak yeniden denenir.'
  }
  return null
}

export function describeMetaApiError(error: MetaApiError): MetaUserError {
  const detail = shortenMetaDetail(error.metaReason)
  const known = error.error ? META_ERROR_MESSAGES[error.error] : undefined
  if ((error.error === 'age_range_not_allowed' || error.error === 'dsa_info_required') && known) return { message: known, detail }
  if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
    return { message: 'Formda düzeltilmesi gereken alanlar var.', detail: null }
  }
  if (error.blocked?.length) {
    return { message: `Reklam metni izin verilmeyen ifade içeriyor: ${error.blocked.join(', ')}`, detail: null }
  }
  if (error.error === 'app_not_live') return { message: META_APP_NOT_LIVE_MESSAGE, detail }
  const base = known ?? error.message ?? 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
  const message = error.stepLabel && !base.startsWith(error.stepLabel) ? `${error.stepLabel}: ${base}` : base
  return { message, detail }
}

export const META_FIELD_ORDER = [
  'name', 'landingUrl', 'primaryText', 'headline', 'description', 'cta',
  'optimizationGoal', 'dailyBudget', 'countries', 'ageMin', 'ageMax', 'advantageAudience', 'gender', 'endDate', 'imagePath',
] as const
export type MetaFieldName = (typeof META_FIELD_ORDER)[number]

export const META_FIELD_LABELS: Record<MetaFieldName, string> = {
  name: 'Kampanya adı',
  landingUrl: 'Hedef sayfa',
  primaryText: 'Ana metin',
  headline: 'Başlık',
  description: 'Açıklama',
  cta: 'Harekete geçirici mesaj',
  dailyBudget: 'Günlük bütçe',
  optimizationGoal: 'Optimizasyon hedefi',
  countries: 'Ülkeler',
  ageMin: 'Yaş (en az)',
  ageMax: 'Yaş (en çok)',
  advantageAudience: 'Advantage+ hedef kitle',
  gender: 'Cinsiyet',
  endDate: 'Bitiş günü',
  imagePath: 'Görsel',
}

export type MetaFieldErrors = Partial<Record<MetaFieldName, string>>

/** Keeps only known fields, in on-screen order, so the first entry is the one to focus. */
export function orderFieldErrors(errors: Record<string, unknown> | null | undefined): Array<[MetaFieldName, string]> {
  if (!errors) return []
  const result: Array<[MetaFieldName, string]> = []
  for (const field of META_FIELD_ORDER) {
    const value = errors[field]
    if (typeof value === 'string' && value) result.push([field, value])
  }
  return result
}

export function toFieldErrors(errors: Record<string, unknown> | null | undefined): MetaFieldErrors {
  return Object.fromEntries(orderFieldErrors(errors)) as MetaFieldErrors
}

export const META_FLOW_STEPS = ['Taslak', 'Doğrula', 'Onayla', 'Oluştur'] as const

/** Index (0-based) of the step the user is on; META_FLOW_STEPS.length means everything is done. */
export function metaFlowStepIndex(plan: { status: string; version: number; validatedVersion: number | null; approvedVersion: number | null } | null): number {
  if (!plan) return 0
  if (['published', 'active', 'user_paused', 'archived'].includes(plan.status)) return META_FLOW_STEPS.length
  if (plan.validatedVersion !== plan.version) return 1
  if (plan.approvedVersion !== plan.version) return 2
  return 3
}

export type MetaPlanObjects = {
  campaignId: string | null
  adSetId: string | null
  imageHash: string | null
  creativeId: string | null
  adId: string | null
}

export type MetaObjectState = 'ok' | 'failed' | 'missing'

const OBJECT_ROWS = [
  { step: 'campaign', key: 'campaignId', label: 'Kampanya' },
  { step: 'adset', key: 'adSetId', label: 'Reklam seti' },
  { step: 'image', key: 'imageHash', label: 'Görsel' },
  { step: 'creative', key: 'creativeId', label: 'Reklam kreatifi' },
  { step: 'ad', key: 'adId', label: 'Reklam' },
] as const

export function describePlanObjects(objects: MetaPlanObjects, failureStep: string | null): Array<{ step: string; label: string; state: MetaObjectState }> {
  // Only the step that actually failed is "failed"; later steps were never attempted.
  return OBJECT_ROWS.map((row) => ({
    step: row.step,
    label: row.label,
    state: objects[row.key] ? ('ok' as const) : failureStep === row.step ? ('failed' as const) : ('missing' as const),
  }))
}

/** Safe message for a stored failure: known code copy first, never the raw Meta text. */
export function describeStoredFailure(plan: { failureStep: string | null; failureCode: string | null; failureReason: string | null }): MetaUserError | null {
  if (!plan.failureCode && !plan.failureReason) return null
  const stepLabel = plan.failureStep ? META_STEP_LABELS[plan.failureStep as keyof typeof META_STEP_LABELS] : undefined
  const known = plan.failureCode ? META_ERROR_MESSAGES[plan.failureCode] : undefined
  const fallback = stepLabel ? `${stepLabel} adımı tamamlanamadı.` : 'Son işlem tamamlanamadı.'
  const message = known ?? fallback
  const detail = plan.failureCode === 'app_not_live' || plan.failureCode === 'age_range_not_allowed' || !known
    ? shortenMetaDetail(plan.failureReason)
    : null
  return { message, detail }
}

/** Turkish status labels, derived from the shared status mapping so they cannot drift. */
export const META_PLAN_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  ['draft', 'validated', 'approved', 'publishing', 'partial', 'failed', 'published', 'active', 'user_paused', 'archived'].map(
    (status) => [status, metaPlanStatusView({ status }, 'tr').label],
  ),
)

type PostFn = <T>(url: string, body: unknown) => Promise<({ ok: true } & T) | MetaApiError>

export type ConfirmAndCreateResult =
  | { ok: true; approvalSkipped: boolean; creditNotice?: string | null }
  | { ok: false; phase: 'approval' | 'publish'; error: MetaApiError }

/**
 * One-click flow: approve (only if this exact version is not approved yet), then publish.
 * A publish failure leaves the approval in place so a retry never asks for consent again.
 */
export async function confirmAndCreate(input: {
  post: PostFn
  planId: string
  version: number
  alreadyApproved: boolean
  termsAccepted: boolean
  requestId: string
  onApproved?: () => void
}): Promise<ConfirmAndCreateResult> {
  if (!input.alreadyApproved) {
    const approval = await input.post('/api/ads/meta/plans/approval', {
      planId: input.planId,
      expectedVersion: input.version,
      termsAccepted: input.termsAccepted,
    })
    if (!approval.ok) return { ok: false, phase: 'approval', error: approval }
    input.onApproved?.()
  }
  const published = await input.post<{ credit?: { state?: string; notice?: string | null } }>('/api/ads/meta/plans/publish', { planId: input.planId, requestId: input.requestId })
  if (!published.ok) return { ok: false, phase: 'publish', error: published }
  const creditNotice = published.credit?.notice ?? null
  return creditNotice
    ? { ok: true, approvalSkipped: input.alreadyApproved, creditNotice }
    : { ok: true, approvalSkipped: input.alreadyApproved }
}
