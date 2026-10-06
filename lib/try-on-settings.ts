'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'

/**
 * Owner-facing toggle for the AI "try it on" storefront feature.
 *
 * Reuses the existing per-project `ecommerce_payment_settings` row (one row
 * per store) rather than introducing a new table — `try_on_enabled` lives
 * alongside the payment method config as another piece of per-store
 * configuration. Defaults to OFF: enabling it costs the owner AI credits on
 * every buyer attempt, so a store should never have it on without the owner
 * explicitly opting in.
 */

/** Verifies the caller owns the project (or is an admin) and returns owner id. */
async function authorizeProjectOwner(projectId: string): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  const { data: owned } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (owned) return owned.owner_id as string

  if (isAdminEmail(user.email ?? null)) {
    const admin = createAdminClient()
    const { data: proj } = await admin
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (proj) return proj.owner_id as string
  }
  throw new Error('NOT_FOUND')
}

/** Loads the current toggle state for the owner-facing settings UI. */
export async function getTryOnEnabledForOwner(projectId: string): Promise<boolean> {
  await authorizeProjectOwner(projectId)
  const admin = createAdminClient()
  const { data } = await admin
    .from('ecommerce_payment_settings')
    .select('try_on_enabled')
    .eq('project_id', projectId)
    .maybeSingle()
  return Boolean(data?.try_on_enabled)
}

/** Persists the owner's try-on toggle. */
export async function setTryOnEnabled(
  projectId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = await authorizeProjectOwner(projectId)
  const admin = createAdminClient()

  const { error } = await admin.from('ecommerce_payment_settings').upsert(
    {
      project_id: projectId,
      owner_id: ownerId,
      try_on_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  )

  if (error) return { ok: false, error: 'save_failed' }

  revalidatePath(`/ecommerce/${projectId}`)
  return { ok: true }
}

/**
 * Public read for the storefront product page: is try-on active for this
 * PUBLISHED store, and who is the owner to charge for generations. Returns
 * `null` when the store doesn't exist, isn't an e-commerce site, or hasn't
 * enabled the feature — callers treat any of those the same way (hide the
 * button).
 */
export async function getTryOnConfigForStore(
  slug: string,
): Promise<{ projectId: string; ownerId: string } | null> {
  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, owner_id, project_type, published')
    .eq('slug', slug)
    .maybeSingle()
  if (!project || !project.published || project.project_type !== 'ecommerce') return null

  const { data: settings } = await admin
    .from('ecommerce_payment_settings')
    .select('try_on_enabled')
    .eq('project_id', project.id)
    .maybeSingle()
  if (!settings?.try_on_enabled) return null

  return { projectId: project.id as string, ownerId: project.owner_id as string }
}
