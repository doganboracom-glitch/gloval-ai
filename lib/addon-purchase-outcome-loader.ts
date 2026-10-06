import { createAdminClient } from '@/lib/supabase/admin'
import { buildPurchaseOutcome, type AddOnPurchaseOutcome } from '@/lib/addon-purchase-outcome'

/**
 * Reads the signed-in user's most recent add-on purchase and turns its stored
 * status into a buyer-facing outcome. Scoped by `userId` from the session, so
 * another user's purchase can never be shown.
 */
export async function getLatestAddOnPurchaseOutcome(userId: string): Promise<AddOnPurchaseOutcome | null> {
  const admin = createAdminClient()
  const { data: purchase, error } = await admin
    .from('addon_purchases')
    .select('id, status, addon_code, period_end_snapshot, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !purchase) return null

  let validUntil: string | null = (purchase.period_end_snapshot as string | null) ?? null
  if (purchase.status === 'granted') {
    const { data: entitlement } = await admin
      .from('user_addon_entitlements')
      .select('expires_at')
      .eq('purchase_id', purchase.id)
      .eq('user_id', userId)
      .maybeSingle()
    validUntil = (entitlement?.expires_at as string | null | undefined) ?? validUntil
  }

  return buildPurchaseOutcome({
    status: purchase.status as string,
    addonCode: purchase.addon_code as string,
    updatedAt: purchase.updated_at as string,
    validUntil,
  })
}
