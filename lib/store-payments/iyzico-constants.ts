/**
 * Shared constants for the PER-STORE iyzico integration (the store owner's own
 * iyzico account). Pure data: importable from client components, server code
 * and tests. The platform's subscription billing has its own adapter
 * (`lib/payments/iyzico.ts`) and does not use anything from here.
 */

/**
 * iyzico partner identification, sent as `paymentSource` on the Checkout Form
 * INITIALIZE request. iyzico's API reference (docs.iyzico.com) defines the
 * field on initialize only; the retrieve request has no such field, so it is
 * not sent there.
 */
export const IYZICO_PAYMENT_SOURCE = 'GLOVAL'

/**
 * `buyer.identityNumber` is a required field of the Checkout Form initialize
 * request, but a store must not collect a national ID just to take a card
 * payment. iyzico's own request samples (docs.iyzico.com) send this value, and
 * the sandbox accepts it. A buyer's real TCKN is only sent when they entered a
 * valid one in their invoice details.
 */
export const IYZICO_BUYER_IDENTITY_PLACEHOLDER = '11111111111'

export const IYZICO_ENVIRONMENTS = ['sandbox', 'live'] as const
export type IyzicoEnvironment = (typeof IYZICO_ENVIRONMENTS)[number]

/**
 * The ONLY two base addresses a store can ever talk to. The owner picks an
 * environment name; a URL is never accepted from the client (SSRF).
 */
export const IYZICO_BASE_URLS: Readonly<Record<IyzicoEnvironment, string>> = {
  sandbox: 'https://sandbox-api.iyzipay.com',
  live: 'https://api.iyzipay.com',
}

export const IYZICO_ENVIRONMENT_LABELS: Record<IyzicoEnvironment, { tr: string; en: string }> = {
  sandbox: { tr: 'Sandbox (test)', en: 'Sandbox (test)' },
  live: { tr: 'Canlı', en: 'Live' },
}

export const DEFAULT_IYZICO_ENVIRONMENT: IyzicoEnvironment = 'sandbox'

export function isIyzicoEnvironment(value: unknown): value is IyzicoEnvironment {
  return typeof value === 'string' && (IYZICO_ENVIRONMENTS as readonly string[]).includes(value)
}

export function iyzicoBaseUrl(environment: IyzicoEnvironment): string {
  return IYZICO_BASE_URLS[environment]
}

/** Path (no host) of the store's payment return endpoint, per store id. */
export function iyzicoReturnPath(projectId: string): string {
  return `/api/store/payment-return/iyzico/${projectId}`
}
