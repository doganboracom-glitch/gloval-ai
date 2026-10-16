'use server'

import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadShippingSettings } from '@/lib/store-shipping-settings'
import { getGeneralPaymentSettings } from '@/lib/store-payments/general-settings'
import { getCarrier } from '@/lib/shipping-carriers'
import { DEFAULT_SHIPPING_SETTINGS } from '@/lib/store-shipping-rules'
import type { StoreFacts } from '@/lib/info-pages'

/**
 * Reads ONLY what the owner configured in the store settings so the Shipping
 * and Payment info pages state real facts. Untouched defaults (zero fee, no
 * note, nothing enabled) are reported as `null`, which makes the template fall
 * back to placeholders instead of claiming "free shipping" nobody chose.
 */
export async function loadStoreFactsAction(projectId: string): Promise<StoreFacts> {
  await authorizeProjectOwner(projectId)

  let shipping: StoreFacts['shipping'] = null
  try {
    const loaded = await loadShippingSettings(createAdminClient(), projectId)
    if (loaded.ok) {
      const s = loaded.settings
      const configured =
        s.feeCents !== DEFAULT_SHIPPING_SETTINGS.feeCents ||
        s.freeThresholdCents !== null ||
        s.deliveryNote !== null ||
        s.defaultCarrier !== null
      if (configured) {
        shipping = {
          feeCents: s.feeCents,
          freeThresholdCents: s.freeThresholdCents,
          deliveryNote: s.deliveryNote,
          carrierName: getCarrier(s.defaultCarrier)?.name ?? null,
        }
      }
    }
  } catch {
    shipping = null
  }

  let payment: StoreFacts['payment'] = null
  try {
    const view = await getGeneralPaymentSettings(projectId)
    const cardEnabled = view.cardEnabled && view.cardReady
    const bankEnabled = view.bankEnabled && view.bankIbanValid
    const codEnabled = view.codEnabled
    if (cardEnabled || bankEnabled || codEnabled) {
      payment = { cardEnabled, bankEnabled, codEnabled, codFeeCents: view.codFeeCents }
    }
  } catch {
    payment = null
  }

  return { shipping, payment }
}
