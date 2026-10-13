import { createAdminClient } from '@/lib/supabase/admin'
import { loadStorePaymentConfig } from '@/lib/store-payment-config'
import { resolveStorePaymentBadges, type PaymentBadgeSet } from '@/lib/payment-badges'

/**
 * Footer payment marks for a PUBLISHED store, resolved server-side from the same
 * policy checkout uses. Never throws: any failure shows no strip (fail closed).
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
    return null
  }
}
