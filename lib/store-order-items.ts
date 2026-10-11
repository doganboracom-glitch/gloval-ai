import type { createAdminClient } from '@/lib/supabase/admin'
import { isMissingColumnError } from '@/lib/store-schema-compat'

/**
 * Reads an order's lines with their frozen VAT. Before scripts/037 the VAT
 * columns do not exist, so the read retries without them and the VAT fields
 * come back undefined (the UI then simply omits the VAT line).
 */
export async function readOrderItems<T extends Record<string, unknown>>(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  columns: string,
): Promise<Array<T & { vat_rate?: number | null; vat_cents?: number | null }>> {
  const withVat = await admin
    .from('ecommerce_order_items')
    .select(`${columns}, vat_rate, vat_cents`)
    .eq('order_id', orderId)
  if (!withVat.error) return (withVat.data ?? []) as unknown as Array<T & { vat_rate?: number | null; vat_cents?: number | null }>
  if (!isMissingColumnError(withVat.error)) return []

  const legacy = await admin.from('ecommerce_order_items').select(columns).eq('order_id', orderId)
  return (legacy.data ?? []) as unknown as Array<T & { vat_rate?: number | null; vat_cents?: number | null }>
}
