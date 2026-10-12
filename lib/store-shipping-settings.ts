import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import {
  DEFAULT_SHIPPING_SETTINGS,
  readShippingSettings,
  type ShippingSettings,
} from '@/lib/store-shipping-rules'

type Admin = ReturnType<typeof createAdminClient>

export const SHIPPING_COLUMNS =
  'shipping_fee_cents, free_shipping_threshold_cents, default_carrier, delivery_note'

export type LoadedShipping =
  | { ok: true; settings: ShippingSettings; migrationApplied: boolean }
  | { ok: false }

/**
 * Reads a project's shipping rules. A missing column (scripts/040 not applied)
 * means "no shipping rules yet" -> defaults. Any other database error is
 * `ok: false`: createOrder must refuse to price an order instead of silently
 * charging 0 shipping.
 */
export async function loadShippingSettings(admin: Admin, projectId: string): Promise<LoadedShipping> {
  const { data, error } = await admin
    .from('ecommerce_payment_settings')
    .select(SHIPPING_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      return { ok: true, settings: DEFAULT_SHIPPING_SETTINGS, migrationApplied: false }
    }
    console.error('[store-shipping] settings read failed', { code: error.code })
    return { ok: false }
  }
  return { ok: true, settings: readShippingSettings(data), migrationApplied: true }
}

/**
 * Display-only shipping rules for a published store (product page, cart,
 * checkout). Never throws; any failure shows as "no shipping rules" because
 * the real price is always recomputed in createOrder.
 */
export async function getStoreShippingInfo(storeSlug: string): Promise<ShippingSettings> {
  try {
    const admin = createAdminClient()
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('slug', storeSlug)
      .eq('published', true)
      .maybeSingle()
    if (!project) return DEFAULT_SHIPPING_SETTINGS
    const loaded = await loadShippingSettings(admin, project.id)
    return loaded.ok ? loaded.settings : DEFAULT_SHIPPING_SETTINGS
  } catch {
    return DEFAULT_SHIPPING_SETTINGS
  }
}
