export type OrderStatusInput = {
  status: string | null | undefined
  paymentStatus: string | null | undefined
  shippingStatus?: string | null
  carrier?: string | null
  trackingNumber?: string | null
}

export type OrderStatusCopy = {
  title: string
  description: string
  icon: 'success' | 'pending' | 'failed'
}

export function orderStatusCopy(input: OrderStatusInput, language: 'tr' | 'en' = 'tr'): OrderStatusCopy {
  const shipping = input.shippingStatus?.toLowerCase()
  const status = input.status?.toLowerCase()
  const payment = input.paymentStatus?.toLowerCase()
  const shipped = shipping === 'shipped' || shipping === 'in_transit'
  const tracking = [input.carrier, input.trackingNumber].filter(Boolean).join(' · ')

  if (status === 'refunded' || payment === 'refunded') {
    return language === 'en'
      ? { title: 'Your order was refunded', description: 'The payment for this order has been refunded.', icon: 'pending' }
      : { title: 'Siparişiniz iade edildi', description: 'Bu siparişin ödemesi iade edildi.', icon: 'pending' }
  }
  if (status === 'cancelled' || status === 'canceled') {
    return language === 'en'
      ? { title: 'Your order was cancelled', description: 'This order is no longer being processed.', icon: 'failed' }
      : { title: 'Siparişiniz iptal edildi', description: 'Bu sipariş artık işleme alınmıyor.', icon: 'failed' }
  }
  if (payment === 'failed' || status === 'failed') {
    return language === 'en'
      ? { title: 'Payment failed', description: 'The payment for this order could not be completed.', icon: 'failed' }
      : { title: 'Ödeme başarısız', description: 'Bu siparişin ödemesi tamamlanamadı.', icon: 'failed' }
  }
  if (shipping === 'delivered' || status === 'delivered') {
    return language === 'en'
      ? { title: 'Your order was delivered', description: 'Your order has been delivered.', icon: 'success' }
      : { title: 'Siparişiniz teslim edildi!', description: 'Siparişiniz teslim edildi.', icon: 'success' }
  }
  if (shipped || status === 'shipped' || status === 'in_transit') {
    const detail = tracking ? (language === 'en' ? `Carrier and tracking: ${tracking}.` : `Kargo: ${tracking}.`) : ''
    return language === 'en'
      ? { title: 'Your order is on its way', description: detail || 'Your order has been handed to the carrier.', icon: 'success' }
      : { title: 'Siparişiniz kargoda', description: detail || 'Siparişiniz kargoya verildi.', icon: 'success' }
  }
  if (payment === 'pending' || status === 'awaiting_payment') {
    return language === 'en'
      ? { title: 'Payment is pending', description: 'Your order will be processed after payment is confirmed.', icon: 'pending' }
      : { title: 'Ödemeniz bekleniyor', description: 'Siparişiniz ödeme onayından sonra işleme alınacak.', icon: 'pending' }
  }
  if (status === 'preparing' || status === 'processing') {
    return language === 'en'
      ? { title: 'Your order is being prepared', description: 'Your order is being prepared.', icon: 'pending' }
      : { title: 'Siparişiniz hazırlanıyor', description: 'Siparişiniz hazırlanıyor.', icon: 'pending' }
  }
  return language === 'en'
    ? { title: 'Your order was received', description: 'Your order has been received.', icon: 'success' }
    : { title: 'Siparişiniz alındı!', description: 'Siparişiniz alındı.', icon: 'success' }
}

export function safeStoreContactHref(baseUrl: string | null, hasContactSection: boolean, email: string | null, slug: string): string | null {
  if (hasContactSection && baseUrl) {
    try {
      const url = new URL(baseUrl)
      const isGlovalTenant = url.hostname === `${slug}.gloval.site` || url.hostname.endsWith('.gloval.site')
      if (!isGlovalTenant || isSafeStoreBaseUrl(baseUrl, slug)) {
        return `${baseUrl.replace(/\/$/, '')}/#contact`
      }
    } catch {
      // Fall through to the store email when the configured URL is malformed.
    }
  }
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `mailto:${email}`
  return null
}

export function isSafeStoreBaseUrl(value: string, slug: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === `${slug}.gloval.site`
  } catch {
    return false
  }
}
