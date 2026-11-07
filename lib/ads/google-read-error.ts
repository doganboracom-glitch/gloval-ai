import { explainGoogleError, type GoogleErrorDetail } from '@/lib/ads/google-error-detail'

/** Which read query a Google rejection came from; used for the audit trail and the per-section UI errors. */
export type GoogleAdsReadQuery = 'campaign_state' | 'keywords' | 'ad_policy' | 'performance'

export type GoogleAdsManagementSection = 'campaign_state' | 'policy' | 'performance'

const RAW_FALLBACK_PREFIX = 'Google reddetti:'

const READ_CATEGORY_MESSAGES: Record<string, string> = {
  queryError: 'Google sorguyu kabul etmedi (alan veya filtre bu hesapta desteklenmiyor).',
  requestError: 'Google isteği kabul etmedi.',
  quotaError: 'Google istek kotası doldu. Biraz sonra yeniden deneyin.',
  internalError: 'Google tarafında geçici bir sorun var. Biraz sonra yeniden deneyin.',
  headerError: 'Google hesap bağlantısı üst bilgisini kabul etmedi. Bağlantıyı yeniden kurun.',
  authorizationError: 'Bu Google Ads hesabı için okuma yetkisi yok. Bağlantıyı yeniden kurun.',
  authenticationError: 'Google oturumu geçersiz. Bağlantıyı yeniden kurun.',
  customerError: 'Google Ads hesabında bir sorun var. Hesap durumunu Google Ads panelinden kontrol edin.',
}

const READ_STATUS_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: 'Bu Google Ads hesabı için okuma yetkisi yok. Bağlantıyı yeniden kurun.',
  UNAUTHENTICATED: 'Google oturumu geçersiz. Bağlantıyı yeniden kurun.',
  INVALID_ARGUMENT: 'Google isteği kabul etmedi.',
  NOT_FOUND: 'Google bu kaydı bulamadı.',
  RESOURCE_EXHAUSTED: 'Google istek kotası doldu. Biraz sonra yeniden deneyin.',
}

const GENERIC_READ_MESSAGE = 'Google bu bilgiyi vermedi. Ayrıntı yönetici panelinde.'

/**
 * Short, plain-language Turkish reason a Google read was rejected. Never exposes raw Google enum values to the owner;
 * those stay in the admin audit trail.
 */
export function explainGoogleReadRejection(details: readonly GoogleErrorDetail[]): string {
  const first = details[0]
  if (!first) return GENERIC_READ_MESSAGE
  const explained = explainGoogleError(first)
  if (!explained.startsWith(RAW_FALLBACK_PREFIX)) return explained
  if (first.category === 'status') return READ_STATUS_MESSAGES[first.value] ?? GENERIC_READ_MESSAGE
  return READ_CATEGORY_MESSAGES[first.category] ?? GENERIC_READ_MESSAGE
}
