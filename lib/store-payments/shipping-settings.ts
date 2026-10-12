'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { loadShippingSettings } from '@/lib/store-shipping-settings'
import {
  parseShippingSettingsInput,
  type ShippingSettings,
  type ShippingSettingsError,
  type ShippingSettingsInput,
} from '@/lib/store-shipping-rules'

/** Owner-only shipping rules (fee, free-shipping threshold, default carrier, note). */

export type ShippingSettingsView = {
  settings: ShippingSettings
  /** False until scripts/040 is applied; non-default values cannot be saved. */
  migrationApplied: boolean
}

export type SaveShippingResult =
  | { ok: true; view: ShippingSettingsView }
  | { ok: false; error: ShippingSettingsError | 'migration_pending' | 'save_failed' }

export async function getShippingSettings(projectId: string): Promise<ShippingSettingsView> {
  await authorizeProjectOwner(projectId)
  const loaded = await loadShippingSettings(createAdminClient(), projectId)
  if (!loaded.ok) throw new Error('read_failed')
  return { settings: loaded.settings, migrationApplied: loaded.migrationApplied }
}

export async function saveShippingSettings(
  projectId: string,
  input: ShippingSettingsInput,
): Promise<SaveShippingResult> {
  const { ownerId } = await authorizeProjectOwner(projectId)

  const parsed = parseShippingSettingsInput(input ?? {})
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const { settings } = parsed

  const admin = createAdminClient()
  const columns = {
    shipping_fee_cents: settings.feeCents,
    free_shipping_threshold_cents: settings.freeThresholdCents,
    default_carrier: settings.defaultCarrier,
    delivery_note: settings.deliveryNote,
    updated_at: new Date().toISOString(),
  }

  const { data: existing, error: readError } = await admin
    .from('ecommerce_payment_settings')
    .select('project_id')
    .eq('project_id', projectId)
    .maybeSingle()
  if (readError) {
    console.error('[shipping-settings] read failed', { projectId, code: readError.code })
    return { ok: false, error: 'save_failed' }
  }

  // Never touch the payment columns of an existing row. A brand new row is
  // created with every payment method OFF, so saving shipping rules can't
  // switch the store's checkout on by accident.
  const { error } = existing
    ? await admin.from('ecommerce_payment_settings').update(columns).eq('project_id', projectId)
    : await admin.from('ecommerce_payment_settings').insert({
        project_id: projectId,
        owner_id: ownerId,
        provider: 'mock',
        enabled: false,
        enabled_providers: [],
        ...columns,
      })

  if (isMissingColumnError(error)) return { ok: false, error: 'migration_pending' }
  if (error) {
    console.error('[shipping-settings] save failed', { projectId, code: error.code })
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath(`/ecommerce/${projectId}`)
  revalidatePath(`/ecommerce/${projectId}/odeme`)
  return { ok: true, view: { settings, migrationApplied: true } }
}
