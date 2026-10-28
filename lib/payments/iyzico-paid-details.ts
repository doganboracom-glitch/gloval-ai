/** Pulls the authoritative charged amount/currency/order ref out of iyzico's retrieve response. */
export function extractPaidDetails(raw: Record<string, unknown>) {
  const paid = typeof raw.paidPrice === 'number' || typeof raw.paidPrice === 'string' ? Number(raw.paidPrice) : Number.NaN
  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : undefined
  const orderRef =
    typeof raw.basketId === 'string' && raw.basketId
      ? raw.basketId
      : typeof raw.conversationId === 'string' && raw.conversationId
        ? raw.conversationId
        : undefined
  return {
    paidAmountCents: Number.isFinite(paid) ? Math.round(paid * 100) : undefined,
    paidCurrency: currency,
    orderRef,
  }
}
