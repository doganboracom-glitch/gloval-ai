import { createAdminClient } from '@/lib/supabase/admin'
import { loadStorePaymentConfig } from '@/lib/store-payment-config'
import {
  resolveStorePaymentBadges,
  STORE_BASE_PAYMENT_BADGES,
  type PaymentBadgeSet,
} from '@/lib/payment-badges'

/**
 * Footer payment marks for a PUBLISHED store, resolved server-side from the same
 * policy checkout uses. Never throws: if the payment configuration cannot be
 * read, only the always-on base logos are returned (no card brand or chip that
 * checkout might not honour).
 */
export async function getStorePaymentBadges(storeSlug: string): Promise<PaymentBadgeSet | null> {
  try {
    const admin = createAdminClient()
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('slug', storeSlug)
      .eq('published', true)
      .maybeSingle()
    if (!project?.id) return null
    return resolveStorePaymentBadges(await loadStorePaymentConfig(project.id as string))
  } catch {
    return { ...STORE_BASE_PAYMENT_BADGES }
  }
}
