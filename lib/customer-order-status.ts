/**
 * Single source of truth for what a store customer sees as the state of an
 * order. It folds payment method + order status + payment status + shipping
 * status into ONE consistent state, so the order page, the account list, the
 * account detail and the e-mails can never disagree (for example a cancelled
 * order that still shows a "Preparing" badge from its default shipping status).
 *
 * Pure and client-safe: no server imports.
 */

export type CustomerOrderLanguage = 'tr' | 'en'

export type CustomerOrderStatusInput = {
  status: string | null | undefined
  paymentStatus: string | null | undefined
  paymentProvider?: string | null
  shippingStatus?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  /** Payment received but the order could not be completed yet (safety net); still being processed. */
  attention?: boolean
}

export type CustomerOrderStatusKey =
  | 'awaiting_payment'
  | 'received'
  | 'preparing'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed'

export type CustomerOrderStatusTone = 'success' | 'pending' | 'info' | 'danger' | 'muted'

export type CustomerOrderStatus = {
  key: CustomerOrderStatusKey
  /** Short badge text, e.g. "Hazırlanıyor". */
  label: string
  tone: CustomerOrderStatusTone
  /** Headline for the order page and e-mails. */
  title: string
  description: string
  icon: 'success' | 'pending' | 'failed'
}

export const COD_RECEIVED_COPY: Record<CustomerOrderLanguage, { title: string; description: string }> = {
  tr: {
    title: 'Siparişiniz alındı',
    description:
      'Lütfen kargo takip e-postasını bekleyin. Gelen gönderiyi takip ederek teslim alabilir ve ödemeyi kapıda yapabilirsiniz. Bizi tercih ettiğiniz için teşekkür ederiz.',
  },
  en: {
    title: 'Your order was received',
    description:
      'Please wait for the shipping tracking email. You can follow the shipment, receive it and pay at the door. Thank you for choosing us.',
  },
}

type Copy = { label: string; title: string; description: string }

const COPY: Record<CustomerOrderLanguage, Record<Exclude<CustomerOrderStatusKey, 'shipped' | 'received'>, Copy>> = {
  tr: {
    awaiting_payment: { label: 'Ödeme bekleniyor', title: 'Ödemeniz bekleniyor', description: 'Siparişiniz ödeme onayından sonra işleme alınacak.' },
    preparing: { label: 'Hazırlanıyor', title: 'Siparişiniz hazırlanıyor', description: 'Siparişiniz hazırlanıyor.' },
    processing: { label: 'İşleniyor', title: 'Ödemeniz alındı, siparişiniz işleniyor', description: 'Ödemeniz bize ulaştı, siparişinizi tamamlıyoruz. Tekrar ödeme yapmanıza gerek yok.' },
    delivered: { label: 'Teslim edildi', title: 'Siparişiniz teslim edildi!', description: 'Siparişiniz teslim edildi.' },
    cancelled: { label: 'İptal edildi', title: 'Siparişiniz iptal edildi', description: 'Bu sipariş artık işleme alınmıyor.' },
    refunded: { label: 'İade edildi', title: 'Siparişiniz iade edildi', description: 'Bu siparişin ödemesi iade edildi.' },
    failed: { label: 'Ödeme başarısız', title: 'Ödeme başarısız', description: 'Bu siparişin ödemesi tamamlanamadı.' },
  },
  en: {
    awaiting_payment: { label: 'Awaiting payment', title: 'Payment is pending', description: 'Your order will be processed after payment is confirmed.' },
    preparing: { label: 'Preparing', title: 'Your order is being prepared', description: 'Your order is being prepared.' },
    processing: { label: 'Processing', title: 'Your payment was received, your order is being processed', description: 'We received your payment and are finishing your order. You do not need to pay again.' },
    delivered: { label: 'Delivered', title: 'Your order was delivered', description: 'Your order has been delivered.' },
    cancelled: { label: 'Cancelled', title: 'Your order was cancelled', description: 'This order is no longer being processed.' },
    refunded: { label: 'Refunded', title: 'Your order was refunded', description: 'The payment for this order has been refunded.' },
    failed: { label: 'Payment failed', title: 'Payment failed', description: 'The payment for this order could not be completed.' },
  },
}

const TONE: Record<CustomerOrderStatusKey, CustomerOrderStatusTone> = {
  awaiting_payment: 'pending',
  received: 'info',
  preparing: 'pending',
  processing: 'pending',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'muted',
  refunded: 'muted',
  failed: 'danger',
}

const ICON: Record<CustomerOrderStatusKey, CustomerOrderStatus['icon']> = {
  awaiting_payment: 'pending',
  received: 'success',
  preparing: 'pending',
  processing: 'pending',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'failed',
  refunded: 'pending',
  failed: 'failed',
}

function lower(value: string | null | undefined): string {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

export function customerOrderStatusKey(input: CustomerOrderStatusInput): CustomerOrderStatusKey {
  const status = lower(input.status)
  const payment = lower(input.paymentStatus)
  const shipping = lower(input.shippingStatus)
  const cod = lower(input.paymentProvider) === 'cash_on_delivery'

  if (status === 'refunded' || payment === 'refunded') return 'refunded'
  if (status === 'cancelled' || status === 'canceled' || shipping === 'cancelled') return 'cancelled'
  if (payment === 'failed' || status === 'failed') return 'failed'
  if (input.attention && payment === 'pending') return 'processing'
  if (shipping === 'delivered' || status === 'delivered') return 'delivered'
  if (shipping === 'shipped' || shipping === 'in_transit' || status === 'shipped' || status === 'in_transit') return 'shipped'
  if (cod && payment === 'pending') return 'received'
  if (payment === 'pending' || status === 'awaiting_payment') return 'awaiting_payment'
  if (status === 'paid' || status === 'preparing' || status === 'processing') return 'preparing'
  return 'received'
}

export function customerOrderStatus(
  input: CustomerOrderStatusInput,
  language: CustomerOrderLanguage = 'tr',
): CustomerOrderStatus {
  const key = customerOrderStatusKey(input)
  const base = { key, tone: TONE[key], icon: ICON[key] }

  if (key === 'shipped') {
    const tracking = [input.carrier, input.trackingNumber].filter(Boolean).join(' · ')
    return language === 'en'
      ? { ...base, label: 'Shipped', title: 'Your order is on its way', description: tracking ? `Carrier and tracking: ${tracking}.` : 'Your order has been handed to the carrier.' }
      : { ...base, label: 'Kargoda', title: 'Siparişiniz kargoda', description: tracking ? `Kargo: ${tracking}.` : 'Siparişiniz kargoya verildi.' }
  }

  if (key === 'received') {
    if (lower(input.paymentProvider) === 'cash_on_delivery') {
      return { ...base, label: language === 'en' ? 'Order received' : 'Sipariş alındı', ...COD_RECEIVED_COPY[language] }
    }
    return language === 'en'
      ? { ...base, label: 'Order received', title: 'Your order was received', description: 'Your order has been received.' }
      : { ...base, label: 'Sipariş alındı', title: 'Siparişiniz alındı!', description: 'Siparişiniz alındı.' }
  }

  return { ...base, ...COPY[language][key] }
}

/** True while the bank-transfer / payment-instruction block may still be relevant. */
export function isAwaitingCustomerPayment(input: CustomerOrderStatusInput): boolean {
  return customerOrderStatusKey(input) === 'awaiting_payment'
}
