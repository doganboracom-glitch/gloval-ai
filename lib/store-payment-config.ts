import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveStorePayment,
  type StorePaymentResolution,
  type StorePaymentRow,
} from '@/lib/store-payment-policy'

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
    const { data, error } = await admin
      .from('ecommerce_payment_settings')
      .select('provider, enabled, enabled_providers, public_config')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      console.error('[store-payments] settings read failed', {
        projectId,
        code: error.code,
        message: error.message,
      })
      return resolveStorePayment(null, true)
    }
    return resolveStorePayment((data as StorePaymentRow | null) ?? null, false)
  } catch (err) {
    console.error('[store-payments] settings read threw', {
      projectId,
      message: err instanceof Error ? err.message : 'unknown',
    })
    return resolveStorePayment(null, true)
  }
}
