/**
 * The iyzico paymentId is shown to the store OWNER only (Siparişler panel), so
 * they can quote it to iyzico support. It never belongs on buyer pages or in
 * buyer e-mails. Only card payments (`iyzico`) have one; bank transfer and cash
 * on delivery never do.
 */
export function ownerPaymentId(order: {
  payment_provider: string
  provider_payment_id?: string | null
}): string | null {
  if (order.payment_provider !== 'iyzico') return null
  const id = order.provider_payment_id?.trim()
  return id ? id : null
}

export const OWNER_PAYMENT_ID_COPY = {
  tr: { label: 'iyzico Ödeme No', copy: 'Kopyala', copied: 'Kopyalandı' },
  en: { label: 'iyzico Payment ID', copy: 'Copy', copied: 'Copied' },
} as const
