import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { readStoredSecrets } from '@/lib/store-payments/secrets-store'
import {
  DEFAULT_IYZICO_ENVIRONMENT,
  isIyzicoEnvironment,
  type IyzicoEnvironment,
} from '@/lib/store-payments/iyzico-constants'
import type { IyzicoCredentials } from '@/lib/store-payments/iyzico'

type Admin = ReturnType<typeof createAdminClient>

export type IyzicoPublicConfig = {
  environment: IyzicoEnvironment
  /** True only after a successful connection test of the CURRENT credentials. */
  tested: boolean
}

/** Non-secret iyzico settings from a store's `public_config`. */
export function readIyzicoPublic(publicConfig: unknown): IyzicoPublicConfig {
  const root =
    publicConfig && typeof publicConfig === 'object' && !Array.isArray(publicConfig)
      ? (publicConfig as Record<string, unknown>)
      : {}
  const node = root.iyzico
  const src =
    node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>) : {}
  return {
    environment: isIyzicoEnvironment(src.environment) ? src.environment : DEFAULT_IYZICO_ENVIRONMENT,
    tested: src.tested === 'true',
  }
}

export type CredentialLoad =
  | { ok: true; creds: IyzicoCredentials; tested: boolean }
  | { ok: false; reason: 'not_configured' | 'unreadable' }

/**
 * Reads ONE store's own iyzico keys. The row is selected by project id, so a
 * store can never get another store's keys. Nothing here is logged.
 */
export async function loadIyzicoCredentials(admin: Admin, projectId: string): Promise<CredentialLoad> {
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select('public_config, secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return { ok: false, reason: 'unreadable' }
  if (!data) return { ok: false, reason: 'not_configured' }

  let stored
  try {
    stored = readStoredSecrets((data.secret_encrypted as string | null) ?? null)
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const apiKey = stored.iyzico?.api_key?.trim() ?? ''
  const secretKey = stored.iyzico?.secret_key?.trim() ?? ''
  if (!apiKey || !secretKey) return { ok: false, reason: 'not_configured' }

  const pub = readIyzicoPublic(data.public_config)
  return { ok: true, creds: { apiKey, secretKey, environment: pub.environment }, tested: pub.tested }
}

/** Can the order table hold the iyzico nonce / payment id (SQL 052 applied)? */
export async function orderColumnsReady(admin: Admin): Promise<boolean> {
  const { error } = await admin.from('ecommerce_orders').select('payment_nonce, provider_payment_id').limit(1)
  return !error
}
