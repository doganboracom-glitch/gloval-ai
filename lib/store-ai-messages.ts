import type { StoreAiErrorCode } from '@/lib/store-ai-engine'

export const STORE_AI_INSUFFICIENT_MESSAGE = 'AI krediniz yetersiz. Devam etmek için kredi yükleyin.'

export const STORE_AI_ERROR_MESSAGES: Record<StoreAiErrorCode | 'invalid_request' | 'not_found' | 'unauthenticated' | 'admin_not_supported' | 'no_input', string> = {
  insufficient_credits: STORE_AI_INSUFFICIENT_MESSAGE,
  busy: 'Devam eden bir yapay zekâ isteğiniz var. Bitmesini bekleyin.',
  rate_limited_minute: 'Çok hızlı istek gönderdiniz. Bir dakika sonra tekrar deneyin.',
  rate_limited_daily: 'Günlük yapay zekâ istek sınırına ulaştınız. Yarın tekrar deneyin.',
  duplicate_request: 'Bu istek zaten işlendi. Yeniden denemek için düğmeye tekrar basın.',
  forbidden_product: 'Bu ürün için yapay zekâ kullanılamaz. Kredi düşülmedi.',
  refused: 'Bu ürün için içerik üretilemedi. Kredi düşülmedi, varsa iade edildi.',
  aborted: 'İstek iptal edildi. Varsa kredi iade edildi.',
  generation_failed: 'İçerik üretilemedi. Varsa kredi iade edildi, lütfen tekrar deneyin.',
  invalid_request: 'İstek geçersiz.',
  not_found: 'Mağaza bulunamadı.',
  unauthenticated: 'Oturumunuz kapanmış. Lütfen yeniden giriş yapın.',
  admin_not_supported: 'Yönetici hesabıyla başka bir mağaza adına yapay zekâ kullanılamaz.',
  no_input: 'Önce bir görsel yükleyin veya ürün adı yazın.',
}

export const STORE_AI_HTTP_STATUS: Record<keyof typeof STORE_AI_ERROR_MESSAGES, number> = {
  insufficient_credits: 402,
  busy: 429,
  rate_limited_minute: 429,
  rate_limited_daily: 429,
  duplicate_request: 409,
  forbidden_product: 422,
  refused: 422,
  aborted: 499,
  generation_failed: 502,
  invalid_request: 400,
  not_found: 404,
  unauthenticated: 401,
  admin_not_supported: 403,
  no_input: 400,
}
