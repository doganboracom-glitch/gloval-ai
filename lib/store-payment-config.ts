import { createAdminClient } from '@/lib/supabase/admin'
import { loadDemoStoreIds } from '@/lib/store-demo'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  isCardProviderId,
  normalizeCardProvider,
  type CardProviderId,
} from '@/lib/payments/card-providers'
import {
  isDemoStore,
  resolveStorePayment,
  type StorePaymentResolution,
  type StorePaymentRow,
} from '@/lib/store-payment-policy'

const BASE_COLUMNS = 'provider, enabled, enabled_providers, public_config'
const CHECKOUT_COLUMNS = `${BASE_COLUMNS}, guest_checkout, active_card_provider, cod_fee_cents`

type Admin = ReturnType<typeof createAdminClient>

/**
 * Reads the settings row including the checkout columns from migration 036,
 * falling back to the legacy column set while that migration is not applied
 * (guest checkout then reads as ON, fee as 0, active card as the default).
 */
export async function readStorePaymentRow(admin: Admin, projectId: string) {
  const full = await admin
    .from('ecommerce_payment_settings')
    .select(CHECKOUT_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!isMissingColumnError(full.error)) return full
  return admin
    .from('ecommerce_payment_settings')
    .select(BASE_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle()
}

export type CardReadiness = { ready: boolean; unreadable: boolean }

/**
 * Per-provider readiness checkers (credentials present, decryptable and
 * connection-tested). A provider without an entry here is not integrated and
 * therefore never ready. The integration phase for a provider adds its checker.
 */
const CARD_READINESS_CHECKERS: Partial<
  Record<CardProviderId, (admin: Admin, projectId: string) => Promise<CardReadiness>>
> = {}

/**
 * True when the given card provider can take a payment right now. Anything
 * else (no checker, incomplete or unreadable credentials) is NOT ready — fail
 * closed.
 */
export async function isCardProviderReady(
  admin: Admin,
  projectId: string,
  providerId: CardProviderId,
): Promise<CardReadiness> {
  const check = CARD_READINESS_CHECKERS[providerId]
  if (!check) return { ready: false, unreadable: false }
  try {
    return await check(admin, projectId)
  } catch {
    return { ready: false, unreadable: true }
  }
}

/**
 * Loads and resolves a store's payment configuration. Any query error becomes
 * `config_unreadable` (fail closed) and is logged without personal data — only
 * the project id and the database error code/message.
 *
 * Not a server-action module: callers are server code that has already
 * resolved which project the request is about.
 */
export async function loadStorePaymentConfig(
  projectId: string,
): Promise<StorePaymentResolution> {
  try {
    const admin = createAdminClient()
    const { data, error } = await readStorePaymentRow(admin, projectId)

    if (error) {
      console.error('[store-payments] settings read failed', {
        projectId,
        code: error.code,
        message: error.message,
      })
      return resolveStorePayment(null, true)
    }
    const row = (data as StorePaymentRow | null) ?? null
    const demoIds = await loadDemoStoreIds(admin, projectId)

    const activeCard = normalizeCardProvider(row?.active_card_provider)
    const listsCard = Array.isArray(row?.enabled_providers)
      ? (row!.enabled_providers as string[]).some(isCardProviderId)
      : isCardProviderId(row?.provider)
    const cardReady = listsCard
      ? (await isCardProviderReady(admin, projectId, activeCard)).ready
      : true

    return resolveStorePayment(
      row,
      false,
      undefined,
      isDemoStore(projectId, demoIds),
      cardReady,
    )
  } catch (err) {
    console.error('[store-payments] settings read threw', {
      projectId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return resolveStorePayment(null, true)
  }
}
