import {
  PaymentBuyerError,
  PaymentConfigError,
  PaymentProviderError,
  type BuyerField,
} from './types'

/**
 * Turns whatever a payment-start step threw into ONE structured, secret-free
 * outcome: a stable machine `code` (logged, counted, returned as `detail`), a
 * `userError` key the UI maps to a message, and, when the buyer can fix it, the
 * form `field`. Pure on purpose, so it is unit-testable without a database.
 *
 * Codes:
 *   billing_provider_not_ready   provider selection failed closed (production
 *                                without a live PSP, or mock forbidden)
 *   billing_env_missing:<what>   credentials / host variable not set
 *   billing_env_invalid:<what>   host and credentials disagree or unsupported
 *   billing_buyer_invalid:<field> buyer data the PSP cannot accept
 *   billing_psp_rejected:<code>  PSP answered with an error code
 *   billing_psp_http_<status>    PSP answered with a non-JSON HTTP error
 *   billing_psp_timeout|billing_psp_network
 *   billing_db_error             database failure while persisting the intent
 *   billing_init_unknown         anything else
 */

export type PaymentInitFlow =
  | 'subscribe'
  | 'change_plan'
  | 'renew'
  | 'topup'
  | 'branding_removal'
  | 'addon'

export type PaymentInitUserError = 'payment_not_ready' | 'buyer_invalid' | 'payment_init_failed'

export type PaymentInitFailure = {
  code: string
  userError: PaymentInitUserError
  field?: BuyerField
}

const NOT_READY_MESSAGES = new Set([
  'payment_provider_not_configured',
  'mock_payment_provider_forbidden_in_production',
  'payment_provider_unavailable',
])

/** iyzico errorCodes that name a specific buyer field. Extend as they show up in logs. */
const IYZICO_BUYER_FIELD_BY_CODE: Record<string, BuyerField> = {
  '200310': 'phone',
}

function fieldFromMessage(message: string): BuyerField | undefined {
  const m = message.toLowerCase()
  if (/gsm|telefon|phone/.test(m)) return 'phone'
  if (/identity|kimlik|tckn|vergi/.test(m)) return 'taxId'
  if (/address|adres/.test(m)) return 'address'
  return undefined
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export function classifyPaymentInitFailure(error: unknown): PaymentInitFailure {
  if (error instanceof PaymentBuyerError) {
    return {
      code: `billing_buyer_invalid:${error.field}`,
      userError: 'buyer_invalid',
      field: error.field,
    }
  }

  if (error instanceof PaymentConfigError) {
    const message = error.message
    if (NOT_READY_MESSAGES.has(message)) {
      return { code: 'billing_provider_not_ready', userError: 'payment_not_ready' }
    }
    if (message.endsWith('_missing')) {
      return { code: `billing_env_missing:${slug(message)}`, userError: 'payment_not_ready' }
    }
    return { code: `billing_env_invalid:${slug(message)}`, userError: 'payment_not_ready' }
  }

  if (error instanceof PaymentProviderError) {
    if (error.kind === 'timeout') return { code: 'billing_psp_timeout', userError: 'payment_init_failed' }
    if (error.kind === 'network') return { code: 'billing_psp_network', userError: 'payment_init_failed' }
    if (error.kind === 'http') {
      return { code: `billing_psp_http_${error.httpStatus ?? 0}`, userError: 'payment_init_failed' }
    }
    const field =
      (error.errorCode ? IYZICO_BUYER_FIELD_BY_CODE[error.errorCode] : undefined) ??
      fieldFromMessage(error.message)
    if (field) {
      return {
        code: `billing_buyer_invalid:${field}`,
        userError: 'buyer_invalid',
        field,
      }
    }
    return {
      code: `billing_psp_rejected:${error.errorCode ? slug(error.errorCode) : 'unknown'}`,
      userError: 'payment_init_failed',
    }
  }

  const source = error as { message?: unknown; code?: unknown } | null
  const message = typeof source?.message === 'string' ? source.message : ''
  if (NOT_READY_MESSAGES.has(message)) {
    return { code: 'billing_provider_not_ready', userError: 'payment_not_ready' }
  }
  if (typeof source?.code === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(source.code)) {
    return { code: 'billing_db_error', userError: 'payment_init_failed' }
  }
  return { code: 'billing_init_unknown', userError: 'payment_init_failed' }
}
