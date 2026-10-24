import { createAdminClient } from '@/lib/supabase/admin'
import { MULTILANG_CODE } from '@/lib/billing-utils'
import { isMultilangFeatureUiEnabled } from '@/lib/multilang-feature-flag'
import type { PlanRow } from '@/lib/billing'

/**
 * Server-only helpers for per-site add-ons stored in `project_entitlements`.
 * Deliberately NOT a `'use server'` module: these must never be callable from
 * the browser with an arbitrary project id.
 */

/**
 * Does this site hold an ACTIVE one-time add-on? The single source of truth for
 * add-on gating. Fails closed: any read error means "not owned". Rows end with
 * the site (FK cascade) and a `revoked`/`inactive` row never counts.
 */
export async function hasAddon(projectId: string, code: string): Promise<boolean> {
  if (!projectId || !code) return false
  const { data, error } = await createAdminClient()
    .from('project_entitlements')
    .select('id')
    .eq('project_id', projectId)
    .eq('code', code)
    .eq('status', 'active')
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

/**
 * The Çoklu Dil Paketi catalog row, or null while the feature flag is off. The
 * row ships `active = false` so every catalog reader that filters on `active`
 * (`getPlans`, pricing surfaces) ignores it; the flag is the only switch that
 * lists or sells it.
 */
export async function getMultilangPlanIfEnabled(
  env: Record<string, string | undefined> = process.env,
): Promise<PlanRow | null> {
  if (!isMultilangFeatureUiEnabled(env)) return null
  const { data, error } = await createAdminClient()
    .from('billing_plans')
    .select(
      'id, code, name, description, price_cents, currency, interval, trial_days, features, provider_price_id, product_category, active, sort_order',
    )
    .eq('code', MULTILANG_CODE)
    .maybeSingle()
  if (error || !data) return null
  return data as PlanRow
}
