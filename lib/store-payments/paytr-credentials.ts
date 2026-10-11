import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { readStoredSecrets } from '@/lib/store-payments/secrets-store'
import type { PaytrCredentials } from '@/lib/store-payments/paytr-core'

type Admin = ReturnType<typeof createAdminClient>

export type StoredPaytr = {
  credentials: PaytrCredentials | null
  /** Fingerprint recorded by the last successful connection test, if any. */
  testedFingerprint: string | null
  enabled: boolean
}

/**
 * Reads ONE store's PayTR credentials, scoped by project id. Returns null
 * credentials when nothing is stored; THROWS when a stored blob cannot be
 * decrypted (callers must treat that as "unavailable", never as "empty").
 * Secrets never leave this server module except through the caller.
 */
export async function loadStorePaytr(admin: Admin, projectId: string): Promise<StoredPaytr> {
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select('enabled, enabled_providers, public_config, secret_encrypted')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error('paytr_settings_read_failed')

  const secrets = readStoredSecrets((data?.secret_encrypted as string | null) ?? null)
  const slot = secrets.paytr ?? {}
  const pub = ((data?.public_config as Record<string, Record<string, string>> | null) ?? {}).paytr ?? {}

  const listed = Array.isArray(data?.enabled_providers) ? (data!.enabled_providers as string[]) : []
  const enabled = Boolean(data?.enabled) && listed.includes('paytr')

  const merchantId = (pub.merchant_id ?? '').trim()
  const merchantKey = (slot.merchant_key ?? '').trim()
  const merchantSalt = (slot.merchant_salt ?? '').trim()
  const credentials =
    merchantId && merchantKey && merchantSalt
      ? { merchantId, merchantKey, merchantSalt, testMode: pub.test_mode === '1' }
      : null

  return { credentials, testedFingerprint: slot.tested_fp ?? null, enabled }
}
