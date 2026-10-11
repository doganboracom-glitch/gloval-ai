import { isVatRate, type VatRate } from '@/lib/product-input'

/**
 * Prices are VAT-inclusive, so VAT is the portion already inside the line total:
 * vat = round(total × rate / (100 + rate)). The order total never changes.
 */
export function lineVatCents(lineTotalCents: number, vatRate: number): number {
  return Math.round((lineTotalCents * vatRate) / (100 + vatRate))
}

/** Product `vat_rate` as stored; anything missing or invalid means "not recorded". */
export function readVatRate(raw: unknown): VatRate | null {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
  return isVatRate(value) ? value : null
}

export type VatItem = { vat_rate?: number | null; vat_cents?: number | null }

export type VatSummary = {
  totalCents: number
  /** Ascending by rate. */
  breakdown: Array<{ rate: number; cents: number }>
  mixed: boolean
}

/** null when no line carries frozen VAT (orders placed before the migration). */
export function summarizeVat(items: VatItem[]): VatSummary | null {
  const byRate = new Map<number, number>()
  for (const item of items) {
    if (item.vat_rate == null || item.vat_cents == null) continue
    byRate.set(item.vat_rate, (byRate.get(item.vat_rate) ?? 0) + item.vat_cents)
  }
  if (byRate.size === 0) return null
  const breakdown = [...byRate.entries()].sort(([a], [b]) => a - b).map(([rate, cents]) => ({ rate, cents }))
  return {
    totalCents: breakdown.reduce((sum, row) => sum + row.cents, 0),
    breakdown,
    mixed: breakdown.length > 1,
  }
}

/** Single line: "KDV dahil (toplam KDV: 200,00 ₺)"; mixed rates add a short per-rate breakdown. */
export function formatVatLine(
  summary: VatSummary | null,
  formatMoney: (cents: number) => string,
  lang: 'tr' | 'en' = 'tr',
): string | null {
  if (!summary) return null
  const head =
    lang === 'tr'
      ? `KDV dahil (toplam KDV: ${formatMoney(summary.totalCents)})`
      : `VAT included (total VAT: ${formatMoney(summary.totalCents)})`
  if (!summary.mixed) return head
  const parts = summary.breakdown.map((row) => `%${row.rate}: ${formatMoney(row.cents)}`)
  return `${head} · ${parts.join(', ')}`
}
