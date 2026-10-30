import { createAdminClient } from '@/lib/supabase/admin'
import { AURA_CURSOR_CODE, MULTILANG_CODE } from '@/lib/billing-utils'
import { isAuraCursorFeatureUiEnabled } from '@/lib/aura-cursor-feature-flag'
import { cursorAuraSource, resolveCursorAura, type CursorAuraConfig } from '@/lib/cursor-aura'
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

/** Same as `hasAddon`, resolving the project from its slug (public render path). Fails closed. */
export async function hasAddonForSlug(slug: string, code: string): Promise<boolean> {
  if (!slug || !code) return false
  const admin = createAdminClient()
  const { data: project, error } = await admin.from('projects').select('id').eq('slug', slug).maybeSingle()
  if (error || !project) return false
  return hasAddon(project.id as string, code)
}

/**
 * Render-time gate for the cursor aura. An owner-written effect runs only while
 * the site still holds an active `aura_cursor` right (so a revoked or deleted
 * right switches it off at once); an admin-written one never depends on the right.
 */
export async function shouldRenderCursorAura(slug: string, effects: unknown): Promise<CursorAuraConfig | null> {
  const config = resolveCursorAura(effects)
  if (!config) return null
  if (cursorAuraSource(effects) !== 'owner') return config
  return (await hasAddonForSlug(slug, AURA_CURSOR_CODE)) ? config : null
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

/**
 * The Aura İmleç catalog row (99 TL, KDV dahil, tek seferlik, site başına), or
 * null while `AURA_CURSOR_FEATURE_UI` is off. Ships `active = false` for the same
 * reason as the multilang row.
 */
export async function getAuraCursorPlanIfEnabled(
  env: Record<string, string | undefined> = process.env,
): Promise<PlanRow | null> {
  if (!isAuraCursorFeatureUiEnabled(env)) return null
  const { data, error } = await createAdminClient()
    .from('billing_plans')
    .select(
      'id, code, name, description, price_cents, currency, interval, trial_days, features, provider_price_id, product_category, active, sort_order',
    )
    .eq('code', AURA_CURSOR_CODE)
    .maybeSingle()
  if (error || !data) return null
  return data as PlanRow
}
