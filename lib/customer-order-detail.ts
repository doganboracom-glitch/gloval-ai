/**
 * Pure, client-safe helpers behind the order detail view in the customer
 * account (items, address, payment method). Kept free of server imports so the
 * client component and the loader share one definition.
 */

export type CustomerOrderItem = {
  name: string
  quantity: number
  unit_price_cents: number
  line_total_cents: number
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function int(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0
}

/** Joins the non-empty parts of a stored shipping address into one line. */
export function formatOrderAddress(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const a = raw as Record<string, unknown>
  return [a.address, a.district, a.city, a.postalCode].map(str).filter(Boolean).join(', ')
}

/** Normalises the order-item rows embedded in an order query. */
export function toCustomerOrderItems(raw: unknown): CustomerOrderItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>
    const quantity = Math.max(int(r.quantity), 1)
    const unit = int(r.unit_price_cents)
    const line = r.line_total_cents == null ? unit * quantity : int(r.line_total_cents)
    return { name: str(r.name) || '-', quantity, unit_price_cents: unit, line_total_cents: line }
  })
}

/** Buyer-facing payment method name; card PSP brands are never shown. */
export function orderPaymentMethodLabel(
  provider: string | null | undefined,
  language: 'tr' | 'en' = 'tr',
): string {
  if (!provider) return ''
  if (provider === 'bank_transfer') return language === 'en' ? 'Bank transfer' : 'Havale/EFT'
  if (provider === 'cash_on_delivery') return language === 'en' ? 'Cash on delivery' : 'Kapıda ödeme'
  return language === 'en' ? 'Credit Card' : 'Kredi Kartı'
}
