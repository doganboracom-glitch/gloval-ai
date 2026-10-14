/**
 * Client-safe vocabulary for card-order refunds: error codes, the Turkish
 * messages shown to the owner and the display state. Messages are fixed text
 * chosen by code; no iyzico response text ever reaches the UI.
 */

export type RefundStatus = 'pending' | 'succeeded' | 'failed'

export type RefundErrorCode =
  | 'not_found'
  | 'not_card'
  | 'not_paid'
  | 'no_payment_id'
  | 'in_progress'
  | 'unsupported'
  | 'credentials'
  | 'auth'
  | 'rejected'
  | 'unavailable'
  | 'verify_manually'
  | 'amount_mismatch'
  | 'finalize_failed'

/** iyzico error codes with a known, actionable meaning for the store owner. */
const REJECTION_TEXT: Record<string, string> = {
  '10223': 'Banka gün sonu işlemi henüz yapılmadı; ödeme ertesi gün iade edilebilir.',
  '10237': 'Bu ödeme iyzico tarafında iade edilemiyor; iyzico destek ile iletişime geçin.',
  '5086': 'Ödeme bu iyzico hesabında bulunamadı; kayıtlı anahtarları kontrol edin.',
  '5087': 'Ödeme bu iyzico hesabında bulunamadı; kayıtlı anahtarları kontrol edin.',
}

export function refundRejectionText(code: string): string {
  return (
    REJECTION_TEXT[code] ??
    (code ? `iyzico iadeyi kabul etmedi (kod ${code}).` : 'iyzico iadeyi kabul etmedi.')
  )
}

const ERROR_TEXT: Record<Exclude<RefundErrorCode, 'rejected'>, string> = {
  not_found: 'Sipariş bulunamadı.',
  not_card: 'Bu sipariş kartla ödenmemiş; iyzico iadesi uygulanamaz.',
  not_paid: 'Sipariş ödenmiş görünmüyor; iade edilecek tutar yok.',
  no_payment_id: 'Siparişte iyzico ödeme numarası kayıtlı değil; iyzico panelinden iade edin.',
  in_progress: 'Bu sipariş için iade zaten işleniyor; birkaç dakika sonra kontrol edin.',
  unsupported: 'İade özelliği için veritabanı güncellemesi (scripts/054) henüz uygulanmamış.',
  credentials: 'iyzico anahtarları okunamadı; Ödeme ayarlarından anahtarları yeniden kaydedin.',
  auth: 'iyzico anahtarları kabul edilmedi; Ödeme ayarlarını kontrol edin.',
  unavailable: 'iyzico şu anda yanıt vermiyor; birazdan tekrar deneyin.',
  verify_manually:
    'İade sonucu doğrulanamadı; mükerrer iadeyi önlemek için iyzico panelinde ödemenin durumunu kontrol edin.',
  amount_mismatch: 'iyzico kayıtları sipariş tutarıyla eşleşmedi; iade iyzico panelinden yapılmalı.',
  finalize_failed:
    'iyzico iadesi yapıldı ancak sipariş kaydı güncellenemedi; sistem otomatik tamamlayacak, siparişi "dikkat gerekiyor" olarak göreceksiniz.',
}

export function refundErrorMessage(error: RefundErrorCode, rejectionCode = ''): string {
  const text = error === 'rejected' ? refundRejectionText(rejectionCode) : ERROR_TEXT[error]
  return `İade başarısız: ${text}`
}

export type RefundDisplay = 'none' | 'pending' | 'refunded' | 'failed'

export function refundDisplay(order: {
  refund_status?: string | null
  payment_status: string
}): RefundDisplay {
  if (order.refund_status === 'succeeded' || order.payment_status === 'refunded') return 'refunded'
  if (order.refund_status === 'pending') return 'pending'
  if (order.refund_status === 'failed') return 'failed'
  return 'none'
}

/** A paid card order the owner can still reverse (including one cancelled without a refund). */
export function canRefundCardOrder(order: {
  payment_provider: string
  payment_status: string
  refund_status?: string | null
}): boolean {
  return (
    order.payment_provider === 'iyzico' &&
    order.payment_status === 'paid' &&
    order.refund_status !== 'succeeded'
  )
}

export const REFUND_DISPLAY_LABEL: Record<Exclude<RefundDisplay, 'none'>, string> = {
  pending: 'İade bekliyor',
  refunded: 'İade edildi',
  failed: 'İade başarısız',
}
