import { mockProvider } from './mock'
import { stripeProvider } from './stripe'
import { paytrProvider } from './paytr'
import { iyzicoProvider } from './iyzico'
import { PaymentConfigError, type PaymentProvider, type PaymentProviderId } from './types'

export * from './types'

/**
 * Central registry mapping a provider id to its implementation. New PSPs
 * (bank_transfer) register here; the rest of the app resolves providers only
 * through `getPaymentProvider`.
 */
const providers: Partial<Record<PaymentProviderId, PaymentProvider>> = {
  mock: mockProvider,
  stripe: stripeProvider,
  paytr: paytrProvider,
  iyzico: iyzicoProvider,
}

/** True when a concrete (non-fallback) provider is registered for this id. */
export function isProviderImplemented(id: PaymentProviderId): boolean {
  return Boolean(providers[id])
}

/**
 * Resolve the per-provider webhook secret from server-side env vars. Returns
 * null when unset so verification fails closed rather than trusting unsigned
 * payloads. Secrets live only in the server environment, never in code.
 */
export function getProviderWebhookSecret(id: PaymentProviderId): string | null {
  switch (id) {
    case 'stripe':
      return process.env.STRIPE_WEBHOOK_SECRET ?? null
    case 'paytr':
      // PayTR verifies callbacks with the merchant key + salt, which the
      // adapter reads from env itself. Returning the key here just signals
      // "configured" to callers; a null means verification will fail closed.
      return process.env.PAYTR_MERCHANT_KEY ?? null
    default:
      return null
  }
}

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  const provider = providers[id]
  // Until other providers are implemented, fall back to mock so the store
  // stays functional rather than breaking checkout.
  return provider ?? mockProvider
}

/**
 * The provider id the PLATFORM uses to bill its own tenants (package sales,
 * one-time site rights). This is distinct from a tenant store's per-store
 * provider config: platform billing runs on Gloval's own PSP account, read from
 * server env.
 *
 * Resolution order:
 *   1. Explicit `PLATFORM_PAYMENTS_PROVIDER` override (e.g. to force 'mock').
 *   2. 'iyzico' when the iyzico API credentials are present (current platform
 *      PSP — sandbox or live depending on `IYZICO_BASE_URL`).
 *   3. 'paytr' when the PayTR merchant credentials are present.
 *   4. 'mock' otherwise — keeps local/dev and previews fully functional without
 *      any real PSP keys.
 */
export function getPlatformPaymentProviderId(): PaymentProviderId {
  const id = resolvePlatformPaymentProviderId()
  if (id === 'mock' && process.env.VERCEL_ENV === 'production') {
    throw new PaymentConfigError('mock', 'mock_provider_forbidden_in_production')
  }
  return id
}

function resolvePlatformPaymentProviderId(): PaymentProviderId {
  const explicit = process.env.PLATFORM_PAYMENTS_PROVIDER?.trim() as
    | PaymentProviderId
    | undefined
  if (explicit && providers[explicit]) return explicit
  if (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY) {
    return 'iyzico'
  }
  if (
    process.env.PAYTR_MERCHANT_ID &&
    process.env.PAYTR_MERCHANT_KEY &&
    process.env.PAYTR_MERCHANT_SALT
  ) {
    return 'paytr'
  }
  return 'mock'
}

/** Convenience accessor for the resolved platform billing provider. */
export function getPlatformPaymentProvider(): PaymentProvider {
  return getPaymentProvider(getPlatformPaymentProviderId())
}
