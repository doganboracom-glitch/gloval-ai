import { INVOICE_ELIGIBLE_KINDS, LIVE_PROVIDER, VAT_RATE } from '@/lib/invoices/constants'

export type PaymentCategory = 'subscription' | 'ai_topup' | 'domain' | 'site_right' | 'other'

export const PAYMENT_CATEGORIES: PaymentCategory[] = ['subscription', 'ai_topup', 'domain', 'site_right', 'other']

/** Product type, read from the prefix every ledger writer puts on its idempotency key. */
export function classifyPayment(idempotencyKey: string | null | undefined): PaymentCategory {
  const key = (idempotencyKey ?? '').toLowerCase()
  if (/^dom(reg|ren|trf)_/.test(key)) return 'domain'
  if (key.startsWith('ent_')) return 'site_right'
  if (/^(sub|upgrade|change|renew)_/.test(key)) return 'subscription'
  if (key.startsWith('topup') || key.startsWith('credit')) return 'ai_topup'
  return 'other'
}

export function isInvoiceEligible(tx: { status: string; kind: string; amount_cents: number }): boolean {
  return (
    tx.status === 'succeeded' &&
    (INVOICE_ELIGIBLE_KINDS as readonly string[]).includes(tx.kind) &&
    Number.isInteger(tx.amount_cents) &&
    tx.amount_cents >= 0
  )
}

/** Real iyzico charges are the default worklist; mock and gift rows are test or free records. */
export function isLiveProvider(provider: string | null | undefined): boolean {
  return provider === LIVE_PROVIDER
}

/** A positive iyzico charge is something the customer was really billed for. */
export function expectsInvoice(tx: { provider: string | null; amount_cents: number }): boolean {
  return isLiveProvider(tx.provider) && tx.amount_cents > 0
}

/** Splits a VAT-inclusive total into net and VAT, in kuruş. */
export function splitVat(grossKurus: number, rate: number = VAT_RATE): { net: number; vat: number } {
  const net = Math.round(grossKurus / (1 + rate))
  return { net, vat: grossKurus - net }
}

export function formatKurus(kurus: number): string {
  const sign = kurus < 0 ? '-' : ''
  const abs = Math.abs(kurus)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}
