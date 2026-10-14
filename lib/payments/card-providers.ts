/**
 * THE single list of virtual POS (card) providers a store can use. Pure data,
 * no I/O, shared by the server rules, the owner UI and the tests.
 *
 * Adding a provider = one entry here, a `PAYMENT_METHODS` entry, and (server
 * side) a readiness checker in `lib/store-payment-config.ts`. Until a provider
 * is `integrated`, the card method stays hidden from buyers and cannot be
 * switched on by the owner (fail closed).
 */
export const CARD_PROVIDERS = [
  {
    id: 'iyzico',
    label: 'iyzico',
    /** True once per-store checkout for this provider is implemented. */
    integrated: true,
  },
] as const

export type CardProviderId = (typeof CARD_PROVIDERS)[number]['id']

export const CARD_PROVIDER_IDS: readonly CardProviderId[] = CARD_PROVIDERS.map((p) => p.id)

export const DEFAULT_CARD_PROVIDER: CardProviderId = 'iyzico'

export function isCardProviderId(value: unknown): value is CardProviderId {
  return typeof value === 'string' && (CARD_PROVIDER_IDS as readonly string[]).includes(value)
}

export function isCardProviderIntegrated(value: unknown): boolean {
  return CARD_PROVIDERS.some((p) => p.id === value && p.integrated)
}

/** Stored `active_card_provider` -> a known provider (unknown/legacy -> default). */
export function normalizeCardProvider(value: unknown): CardProviderId {
  return isCardProviderId(value) ? value : DEFAULT_CARD_PROVIDER
}

/** True when at least one card provider can actually be used. */
export function hasIntegratedCardProvider(): boolean {
  return CARD_PROVIDERS.some((p) => p.integrated)
}
