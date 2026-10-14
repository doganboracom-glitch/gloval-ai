import { isAwaitingCustomerPayment } from '@/lib/customer-order-status'
import type { BankTransferConfig } from '@/lib/store-payment-policy'

/**
 * Bank-transfer (havale / EFT) instructions for ONE order of ONE store. This is
 * the single resolver behind every place that shows them: the order status
 * page, the customer account and the "awaiting payment" e-mail. The config
 * passed in must be that store's own payment settings.
 *
 * Pure and client-safe: loading the store config is done by
 * `lib/bank-transfer-instructions-server.ts`.
 */

export type BankTransferInstructionsData = {
  bankName: string
  accountHolder: string
  iban: string
  instructions: string
  /** Order number to put in the transfer description. */
  reference: string
  /** ISO time after which the unpaid order is cancelled automatically. */
  dueAt: string
}

export type BankTransferOrderInput = {
  id: string
  created_at: string
  status: string | null | undefined
  payment_status: string | null | undefined
  payment_provider: string | null | undefined
  shipping_status?: string | null
}

export function orderReference(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

/**
 * Returns the instructions only while the order is a bank-transfer order that
 * still awaits payment. Paid, cancelled, refunded or failed orders get null,
 * so the block disappears the moment the order leaves "awaiting payment".
 */
export function buildBankTransferInstructions(
  config: BankTransferConfig | null | undefined,
  order: BankTransferOrderInput,
): BankTransferInstructionsData | null {
  if (!config || !config.iban) return null
  if (order.payment_provider !== 'bank_transfer') return null
  const awaiting = isAwaitingCustomerPayment({
    status: order.status,
    paymentStatus: order.payment_status,
    paymentProvider: order.payment_provider,
    shippingStatus: order.shipping_status,
  })
  if (!awaiting) return null

  const created = new Date(order.created_at).getTime()
  if (!Number.isFinite(created)) return null

  return {
    bankName: config.bankName,
    accountHolder: config.accountHolder,
    iban: config.iban,
    instructions: config.instructions,
    reference: orderReference(order.id),
    dueAt: new Date(created + config.termDays * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/** Calendar date in the store's timezone, so server and browser render the same text. */
export function formatBankDueDate(iso: string, language: 'tr' | 'en' = 'tr'): string {
  return new Date(iso).toLocaleDateString(language === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
}
