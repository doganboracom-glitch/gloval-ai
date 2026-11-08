import { MetaAdsError, type MetaAdsErrorCode } from '@/lib/ads/meta-ads-error'
import { formatMetaErrorDiagnostic, META_APP_NOT_LIVE_MESSAGE, isMetaAppNotLive, redactMetaErrorMessage, type MetaErrorDetail } from '@/lib/ads/meta-error-detail'

export type MetaPublishStep = 'preflight' | 'campaign' | 'adset' | 'image' | 'creative' | 'ad'

export const META_STEP_LABELS: Record<MetaPublishStep, string> = {
  preflight: 'Hesap kontrolü',
  campaign: 'Kampanya',
  adset: 'Reklam seti',
  image: 'Görsel',
  creative: 'Reklam kreatifi',
  ad: 'Reklam',
}

const META_ADVANTAGE_MAX_AGE_ERROR = { code: 100, subcode: 1870189 }

const FIELD_LABELS: Record<string, string> = {
  name: 'ad',
  daily_budget: 'günlük bütçe',
  targeting: 'hedef kitle',
  object_story_spec: 'reklam metni ve sayfa bağlantısı',
  link: 'açılış adresi',
  link_data: 'reklam metni',
  image_hash: 'görsel',
  end_time: 'bitiş tarihi',
  start_time: 'başlangıç tarihi',
  objective: 'kampanya hedefi',
  special_ad_categories: 'özel reklam kategorisi',
  bid_strategy: 'teklif stratejisi',
  optimization_goal: 'optimizasyon hedefi',
  page_id: 'Facebook sayfası',
  instagram_user_id: 'Instagram hesabı',
  call_to_action: 'eylem çağrısı',
  message: 'ana metin',
  description: 'açıklama',
  age_min: 'yaş aralığı',
  age_max: 'yaş aralığı',
  age_range: 'yaş aralığı',
}

export type MetaPublishFailure = {
  code: MetaAdsErrorCode
  message: string
  /** Bounded, redacted Meta diagnostics for the authenticated owner. */
  metaReason: string | null
  blamedFields: string[]
}

function fieldList(fields: readonly string[] | undefined): string[] {
  return (fields ?? []).map((field) => FIELD_LABELS[field] ?? field)
}

function safeAgeMetaReason(detail: MetaErrorDetail | null): string | null {
  const reason = redactMetaErrorMessage(detail?.userMessage ?? detail?.message)
  if (!reason) return null
  const safeReason = reason
    .replace(/\(#\d+\)/g, '')
    .replace(/\b(?:error[_ ]?code|code|error[_ ]?subcode|subcode)\s*[:=]?\s*\d+\b/gi, '')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return safeReason || null
}

/**
 * Turns a Graph write error into a stable code + Turkish message. Nothing here echoes tokens or raw bodies;
 * `metaReason` is the already-redacted `error_user_msg`/message from {@link MetaErrorDetail}.
 */
export function describeMetaPublishError(error: unknown, step: MetaPublishStep): MetaPublishFailure {
  const label = META_STEP_LABELS[step]
  if (!(error instanceof MetaAdsError)) {
    return { code: 'meta_rejected', message: `${label} adımı tamamlanamadı.`, metaReason: null, blamedFields: [] }
  }
  const detail: MetaErrorDetail | null = error.detail ?? null
  const blamed = fieldList(detail?.blameFields)
  const reason = formatMetaErrorDiagnostic(detail)
  const haystack = `${detail?.userTitle ?? ''} ${detail?.userMessage ?? ''} ${detail?.message ?? ''}`.toLowerCase()
  const code = detail?.code ?? null
  const subcode = detail?.subcode ?? null
  const blamedPageOrInstagram = detail?.blameFields?.some((field) => field === 'page_id' || field === 'instagram_user_id') ?? false
  const mentionsPageOrInstagram = blamedPageOrInstagram || /facebook page|page|instagram|sayfa|instagram_user_id/.test(haystack)
  const mentionsPermission = /permission|access|admin|role|authorized|yetki|erişim|izin/.test(haystack)
  const mentionsVerification = /(advertiser|business|identity|reklamveren|işletme|kimlik).{0,40}(verification|verify|verified|doğrulama|doğrula)|(?:verification|doğrulama).{0,40}(advertiser|business|identity|reklamveren|işletme|kimlik)/.test(haystack)
  const mentionsRestriction = /account.{0,40}(?:restricted|disabled|deactivated)|(?:restricted|disabled|deactivated).{0,40}account|account quality|integrity|hesap.{0,40}(?:kısıtlı|kapatılmış|devre dışı)|(?:kısıtlı|kapatılmış|devre dışı).{0,40}hesap|hesap kalitesi/.test(haystack)

  // Checked before the code switch: Meta sends this as an OAuth-style code 200, which would otherwise read as a missing permission.
  if (isMetaAppNotLive(detail)) {
    return { code: 'app_not_live', message: META_APP_NOT_LIVE_MESSAGE, metaReason: reason, blamedFields: [] }
  }
  if (mentionsVerification) {
    return {
      code: 'advertiser_verification_required',
      message: 'Meta reklamveren, işletme veya kimlik doğrulaması istiyor. Meta Business Support Home > Hesap Kalitesi bölümündeki doğrulama adımlarını tamamlayıp yeniden deneyin.',
      metaReason: reason,
      blamedFields: blamed,
    }
  }
  if (mentionsPageOrInstagram && (mentionsPermission || error.code === 'permission_missing' || error.code === 'config_permission_missing')) {
    return {
      code: 'page_required',
      message: 'Meta bu reklam için Sayfa veya Instagram reklam erişimini reddetti. Meta Business Suite > Sayfa erişimi bölümünde hesabınızın reklam yetkisini; Instagram yerleşimi kullanılıyorsa profesyonel Instagram hesabının aynı Sayfaya bağlı ve reklam hesabında kullanılabilir olduğunu doğrulayın.',
      metaReason: reason,
      blamedFields: blamed,
    }
  }
  if (error.code === 'account_restricted' || code === 273 || code === 2635 || mentionsRestriction) {
    return {
      code: 'account_restricted',
      message: 'Reklam hesabı kısıtlanmış veya devre dışı. Meta Business Support Home > Hesap Kalitesi bölümünde reklam hesabı, ödeme kısıtlaması ve istenen doğrulamaları kontrol edin.',
      metaReason: reason,
      blamedFields: blamed,
    }
  }

  switch (error.code) {
    case 'reauth_required':
    case 'token_expired':
      return { code: 'reauth_required', message: 'Meta bağlantınızın süresi dolmuş. Bağlantıyı yenileyin.', metaReason: null, blamedFields: [] }
    case 'permission_missing':
    case 'config_permission_missing':
      return { code: 'publish_permission_missing', message: 'Meta reklam yönetim iznini reddetti. Meta Business Ayarları’nda bağlanan hesabın reklam hesabında kampanya oluşturma yetkisini ve gerekli ek izinleri doğrulayın.', metaReason: reason, blamedFields: blamed }
    case 'rate_limited':
      return { code: 'rate_limited', message: 'Meta istek sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.', metaReason: null, blamedFields: [] }
    case 'provider_unavailable':
    case 'write_outcome_unknown':
      return { code: error.code, message: 'Meta şu an yanıt vermedi. Sonucu doğrulamak için tekrar deneyin; aynı kampanya iki kez oluşturulmaz.', metaReason: null, blamedFields: [] }
    default:
      break
  }

  const ageRelated =
    step === 'adset' &&
    ((code === META_ADVANTAGE_MAX_AGE_ERROR.code && subcode === META_ADVANTAGE_MAX_AGE_ERROR.subcode) ||
      detail?.blameFields?.some((field) => ['age_min', 'age_max', 'age_range'].includes(field)) ||
      /\b(?:age(?:_min|_max|_range)?|yaş(?:\s+aralığı)?)\b/.test(haystack))
  if (ageRelated) {
    return {
      code: 'age_range_not_allowed',
      message: 'Meta Advantage+ kitle, en çok yaşın 65 olmasını ister. Yaş aralığını 18-65 yapın.',
      metaReason: safeAgeMetaReason(detail),
      blamedFields: fieldList(['age_range']),
    }
  }
  if (code === 2635 || subcode === 1359188 || (subcode !== null && String(subcode).startsWith('1487'))) {
    const payment = /payment|funding|billing|ödeme|card/.test(haystack)
    return {
      code: payment ? 'payment_method_missing' : 'account_restricted',
      message: payment
        ? 'Reklam hesabında geçerli bir ödeme yöntemi yok. Meta Reklam Yöneticisi\'nden ödeme yöntemi ekleyin.'
        : 'Reklam hesabı kısıtlanmış veya kapatılmış görünüyor. Meta Business Support Home > Hesap Kalitesi bölümünde durumu kontrol edin.',
      metaReason: reason,
      blamedFields: blamed,
    }
  }
  if (detail?.blameFields?.includes('daily_budget') || /budget/.test(haystack) && /(low|minimum|at least)/.test(haystack)) {
    return { code: 'budget_too_low', message: 'Günlük bütçe, Meta\'nın bu hesap ve ülke için istediği asgari tutarın altında.', metaReason: reason, blamedFields: blamed }
  }
  if (detail?.blameFields?.includes('image_hash') || /image/.test(haystack) && /(size|ratio|dimension|invalid)/.test(haystack)) {
    return { code: 'image_invalid', message: 'Meta görseli kabul etmedi. Daha büyük, 4:5 ile 1.91:1 arasında bir JPG/PNG deneyin.', metaReason: reason, blamedFields: blamed }
  }
  if (/special ad categor/.test(haystack)) {
    return { code: 'special_category_unsupported', message: 'Meta bu içeriği özel reklam kategorisi olarak değerlendirdi; bu sürümde desteklenmiyor.', metaReason: reason, blamedFields: blamed }
  }
  const where = blamed.length > 0 ? ` Sorunlu alan: ${blamed.join(', ')}.` : ''
  return { code: 'meta_rejected', message: `Meta ${label.toLocaleLowerCase('tr-TR')} adımını reddetti.${where}`, metaReason: reason, blamedFields: blamed }
}
