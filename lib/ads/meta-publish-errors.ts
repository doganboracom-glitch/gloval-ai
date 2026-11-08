import { MetaAdsError, type MetaAdsErrorCode } from '@/lib/ads/meta-ads-error'
import { META_APP_NOT_LIVE_MESSAGE, isMetaAppNotLive, type MetaErrorDetail } from '@/lib/ads/meta-error-detail'

export type MetaPublishStep = 'preflight' | 'campaign' | 'adset' | 'image' | 'creative' | 'ad'

export const META_STEP_LABELS: Record<MetaPublishStep, string> = {
  preflight: 'Hesap kontrolü',
  campaign: 'Kampanya',
  adset: 'Reklam seti',
  image: 'Görsel',
  creative: 'Reklam kreatifi',
  ad: 'Reklam',
}

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
  /** Optional explanatory detail after credential and provider-code redaction. */
  metaReason: string | null
  blamedFields: string[]
}

function fieldList(fields: readonly string[] | undefined): string[] {
  return (fields ?? []).map((field) => FIELD_LABELS[field] ?? field)
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
  const reason = detail?.userMessage ?? detail?.message ?? null
  const haystack = `${detail?.userMessage ?? ''} ${detail?.message ?? ''}`.toLowerCase()
  const code = detail?.code ?? null
  const subcode = detail?.subcode ?? null

  // Checked before the code switch: Meta sends this as an OAuth-style code 200, which would otherwise read as a missing permission.
  if (isMetaAppNotLive(detail)) {
    return { code: 'app_not_live', message: META_APP_NOT_LIVE_MESSAGE, metaReason: reason, blamedFields: [] }
  }

  switch (error.code) {
    case 'reauth_required':
    case 'token_expired':
      return { code: 'reauth_required', message: 'Meta bağlantınızın süresi dolmuş. Bağlantıyı yenileyin.', metaReason: null, blamedFields: [] }
    case 'permission_missing':
    case 'config_permission_missing':
      return { code: 'publish_permission_missing', message: 'Kampanya oluşturmak için Meta yönetim izni gerekli. İzni verip tekrar deneyin.', metaReason: null, blamedFields: [] }
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
    (detail?.blameFields?.some((field) => ['age_min', 'age_max', 'age_range'].includes(field)) ||
      /\b(?:age(?:_min|_max|_range)?|yaş(?:\s+aralığı)?)\b/.test(haystack))
  if (ageRelated) {
    return {
      code: 'age_range_not_allowed',
      message: 'Meta Advantage+ kitlede yaş aralığı öneri olarak kullanılmalı. En az yaşı 25’i, en çok yaşı 65’i aşmayacak şekilde düzenleyin veya Advantage+ kitleyi kapatın.',
      metaReason: null,
      blamedFields: ['age_range'],
    }
  }
  if (code === 2635 || subcode === 1359188 || (subcode !== null && String(subcode).startsWith('1487'))) {
    const payment = /payment|funding|billing|ödeme|card/.test(haystack)
    return {
      code: payment ? 'payment_method_missing' : 'account_restricted',
      message: payment
        ? 'Reklam hesabında geçerli bir ödeme yöntemi yok. Meta Reklam Yöneticisi\'nden ödeme yöntemi ekleyin.'
        : 'Reklam hesabı kısıtlanmış veya kapatılmış görünüyor. Meta Reklam Yöneticisi\'nden durumu kontrol edin.',
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
  if (/page/.test(haystack) && /(permission|access|admin|role)/.test(haystack)) {
    return { code: 'page_required', message: 'Seçili Facebook sayfası için reklam verme yetkiniz yok. Sayfa yönetici rolünüzü kontrol edin.', metaReason: reason, blamedFields: blamed }
  }
  if (/special ad categor/.test(haystack)) {
    return { code: 'special_category_unsupported', message: 'Meta bu içeriği özel reklam kategorisi olarak değerlendirdi; bu sürümde desteklenmiyor.', metaReason: reason, blamedFields: blamed }
  }
  const where = blamed.length > 0 ? ` Sorunlu alan: ${blamed.join(', ')}.` : ''
  return { code: 'meta_rejected', message: `Meta ${label.toLocaleLowerCase('tr-TR')} adımını reddetti.${where}`, metaReason: reason, blamedFields: blamed }
}
