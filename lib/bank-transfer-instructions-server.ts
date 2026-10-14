import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'
import { readBankTransferConfig, type BankTransferConfig } from '@/lib/store-payment-policy'

type Admin = ReturnType<typeof createAdminClient>

/** Reads ONLY the given store's bank-transfer settings (scoped by project id). */
export async function loadBankTransferConfig(
  admin: Admin,
  projectId: string,
): Promise<BankTransferConfig | null> {
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select('public_config')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    console.error('[bank-transfer] settings read failed', { projectId, code: error.code })
    return null
  }
  return readBankTransferConfig(data?.public_config)
}
