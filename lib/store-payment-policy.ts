import type { PaymentProviderId } from '@/lib/payments/types'
import { PAYMENT_METHODS, isCardProviderMethod } from '@/lib/payments/methods'

/**
 * Pure policy for STORE (tenant e-commerce) payments. Deliberately free of
 * I/O and of `'use server'` so it can be unit-tested and imported anywhere.
 *
 * The rule: a store only ever takes payment through a provider its owner
 * explicitly configured. Anything else (no row, disabled, empty list, or a
 * database error while reading the row) FAILS CLOSED — it never degrades to
 * the `mock` provider, which settles instantly as "paid".
 *
 * This is separate from the platform-billing guard in `lib/payments/index.ts`
 * (`getPlatformPaymentProviderId`), which only covers Gloval's own billing.
 */

/** Real providers a store owner can select; sourced from the owner UI metadata. */
const OWNER_SELECTABLE = new Set<string>(PAYMENT_METHODS.map((m) => m.id))

/** Providers with no PSP round trip: the order stays pending until the owner confirms. */
export const MANUAL_STORE_PROVIDERS = ['bank_transfer', 'cash_on_delivery'] as const

export function isManualStoreProvider(id: string): boolean {
  return (MANUAL_STORE_PROVIDERS as readonly string[]).includes(id)
}

/**
 * THE single demo-store switch. A store is a demo store only when its project
 * id is in the server-resolved allowlist (`demo_stores` table and/or the
 * `DEMO_STORE_PROJECT_IDS` env var, see `lib/store-demo.ts`). Never derive
 * this from anything the browser sends, and never from the slug: a tenant can
 * pick any free slug, but cannot write to `demo_stores`.
 */
export function isDemoStore(
  projectId: string | null | undefined,
  demoProjectIds: ReadonlySet<string>,
): boolean {
  return Boolean(projectId) && demoProjectIds.has(projectId as string)
}

/** Parses a comma/space separated list of project ids (env allowlist). */
export function parseDemoStoreIds(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export const DEFAULT_PAYMENT_TERM_DAYS = 3
export const MIN_PAYMENT_TERM_DAYS = 1
export const MAX_PAYMENT_TERM_DAYS = 30

/** Parses an owner-entered term; null when not a whole number in range. */
export function parsePaymentTermDays(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{1,3}$/.test(text)) return null
  const n = Number(text)
  return n >= MIN_PAYMENT_TERM_DAYS && n <= MAX_PAYMENT_TERM_DAYS ? n : null
}

export type BankTransferConfig = {
  bankName: string
  accountHolder: string
  iban: string
  instructions: string
  termDays: number
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * Reads the bank-transfer config from a store's `public_config`. The owner UI
 * stores values keyed by method (`public_config.bank_transfer.iban`); a flat
 * legacy shape is accepted as a fallback.
 */
export function readBankTransferConfig(publicConfig: unknown): BankTransferConfig {
  const root =
    publicConfig && typeof publicConfig === 'object' && !Array.isArray(publicConfig)
      ? (publicConfig as Record<string, unknown>)
      : {}
  const nested = root.bank_transfer
  const src =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : root
  return {
    bankName: stringField(src, 'bank_name'),
    accountHolder: stringField(src, 'account_holder'),
    iban: stringField(src, 'iban'),
    instructions: stringField(src, 'instructions'),
    termDays: parsePaymentTermDays(src.payment_term_days) ?? DEFAULT_PAYMENT_TERM_DAYS,
  }
}

/** True once a pending manual order is older than its payment term. */
export function isManualOrderExpired(
  createdAt: string | Date,
  now: Date | number,
  termDays: number,
): boolean {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return false
  const nowMs = typeof now === 'number' ? now : now.getTime()
  return nowMs - created >= termDays * 24 * 60 * 60 * 1000
}

/**
 * Mock store payments are allowed ONLY outside production AND with the
 * explicit opt-in flag. `VERCEL_ENV === 'production'` always wins.
 */
export function isMockStorePaymentsAllowed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.VERCEL_ENV === 'production') return false
  return env.ALLOW_MOCK_STORE_PAYMENTS === 'true'
}

export type StorePaymentRow = {
  provider?: string | null
  enabled?: boolean | null
  enabled_providers?: unknown
  public_config?: unknown
}

export type StorePaymentUnavailableReason = 'not_configured' | 'config_unreadable'

export type StorePaymentResolution =
  | {
      ok: true
      /** Methods a buyer may choose from, in the owner's order. */
      methods: PaymentProviderId[]
      /** Used when the buyer's pick is missing or not permitted. */
      defaultProvider: PaymentProviderId
      publicConfig: Record<string, unknown>
      /** True for a server-verified demo store (mock card allowed, no real money). */
      demo: boolean
    }
  | { ok: false; reason: StorePaymentUnavailableReason }

/**
 * Decides which methods a store can accept right now.
 *
 * @param row   the `ecommerce_payment_settings` row, or null when none exists
 * @param readFailed true when the query itself errored (NOT "no row")
 * @param demo true when `isDemoStore` matched this store (server-verified)
 */
export function resolveStorePayment(
  row: StorePaymentRow | null,
  readFailed: boolean,
  mockAllowed: boolean = isMockStorePaymentsAllowed(),
  demo: boolean = false,
): StorePaymentResolution {
  // A database error says nothing about the owner's configuration. Never read
  // it as "no settings" — fail closed, regardless of the mock flag.
  if (readFailed) return { ok: false, reason: 'config_unreadable' }

  // Demo stores always get the mock card and never a real card PSP, so a demo
  // store can never move real money even if credentials were left configured.
  const usable = (id: unknown): id is PaymentProviderId => {
    if (typeof id !== 'string') return false
    if (id === 'mock') return mockAllowed || demo
    if (demo && isCardProviderMethod(id)) return false
    return OWNER_SELECTABLE.has(id)
  }

  let methods: PaymentProviderId[] = []
  let primary: PaymentProviderId | null = null
  let publicConfig: Record<string, unknown> = {}

  if (row && row.enabled) {
    const listed = Array.isArray(row.enabled_providers) ? row.enabled_providers : []
    const candidates = listed.length > 0 ? listed : [row.provider]
    methods = Array.from(new Set(candidates.filter(usable)))
    if (methods.length > 0) {
      primary = usable(row.provider) && methods.includes(row.provider) ? row.provider : methods[0]
      publicConfig =
        row.public_config && typeof row.public_config === 'object'
          ? (row.public_config as Record<string, unknown>)
          : {}
    }
  }

  if (demo) {
    const rest = methods.filter((m) => m !== 'mock')
    return { ok: true, methods: ['mock', ...rest], defaultProvider: 'mock', publicConfig, demo: true }
  }

  if (methods.length > 0 && primary) {
    return { ok: true, methods, defaultProvider: primary, publicConfig, demo: false }
  }

  // No usable owner configuration. The ONLY remaining option is the explicit
  // non-production mock opt-in.
  if (mockAllowed) {
    return { ok: true, methods: ['mock'], defaultProvider: 'mock', publicConfig: {}, demo: false }
  }
  return { ok: false, reason: 'not_configured' }
}

/** Buyer-facing copy for a store that cannot take orders. */
export const STORE_PAYMENT_UNAVAILABLE_MESSAGE: {
  not_configured: { tr: string; en: string }
  config_unreadable: { tr: string; en: string }
} = {
  not_configured: {
    tr: 'Bu mağaza şu an sipariş alamıyor, ödeme yöntemi tanımlanmamış.',
    en: 'This store cannot take orders right now: no payment method has been set up.',
  },
  config_unreadable: {
    tr: 'Ödeme bilgileri şu an alınamadı. Lütfen biraz sonra tekrar deneyin.',
    en: 'Payment details could not be loaded right now. Please try again shortly.',
  },
}

/** Error codes returned by `createOrder` when payments are unavailable. */
export const STORE_PAYMENT_ERROR_CODE: Record<StorePaymentUnavailableReason, string> = {
  not_configured: 'payment_not_configured',
  config_unreadable: 'payment_config_unreadable',
}
