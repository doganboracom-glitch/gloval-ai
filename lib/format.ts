// Framework-neutral currency formatting usable from both server and client
// components. Prices are stored as integer minor units (cents/kuruş).
export function formatPrice(cents: number, currency = 'TRY'): string {
  const amount = (cents ?? 0) / 100
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Fall back gracefully if an unknown currency code is passed.
    return `${amount.toFixed(2)} ${currency}`
  }
}
