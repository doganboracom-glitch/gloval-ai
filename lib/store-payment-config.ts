import { createAdminClient } from '@/lib/supabase/admin'
import { loadDemoStoreIds } from '@/lib/store-demo'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { loadStorePaytr } from '@/lib/store-payments/paytr-credentials'
import { credentialFingerprint } from '@/lib/store-payments/paytr-core'
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
 * (guest checkout then reads as ON, fee as 0, active card as PayTR).
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

/**
 * True when the store's card provider can take a payment right now: its
 * credentials decrypt, are complete, and passed the connection test. Anything
 * else (including an unreadable secret blob) is NOT ready — fail closed.
 */
export async function isCardProviderReady(
  admin: Admin,
  projectId: string,
): Promise<{ ready: boolean; unreadable: boolean }> {
  try {
    const stored = await loadStorePaytr(admin, projectId)
    const ready = Boolean(
      stored.credentials &&
        stored.testedFingerprint &&
        stored.testedFingerprint === credentialFingerprint(stored.credentials),
    )
    return { ready, unreadable: false }
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

    const listsCard = Array.isArray(row?.enabled_providers)
      ? (row!.enabled_providers as string[]).includes('paytr')
      : row?.provider === 'paytr'
    const cardReady = listsCard ? (await isCardProviderReady(admin, projectId)).ready : true

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
