'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanCodeForUser } from '@/lib/billing'
import { loadProjectCommerce } from '@/lib/commerce-mode-server'
import { requireUser } from '@/lib/ecommerce-access'
import { isCatalogFeatureUiEnabled } from '@/lib/catalog-feature-flag'
import {
  CATALOG_PLAN_WARNING,
  catalogColumns,
  catalogToggleBlocker,
  type CatalogToggleBlocker,
} from '@/lib/catalog-feature'

export type CatalogToggleResult =
  | { ok: true; enabled: boolean }
  | {
      ok: false
      error: CatalogToggleBlocker | 'not_found' | 'update_failed' | 'audit_failed' | 'feature_disabled'
      message?: string
    }

/**
 * Owner-side switch for the catalog feature. Writes `commerce_mode` only,
 * records the change in `site_type_changes`, and undoes the write when that
 * audit row cannot be stored.
 */
export async function setCatalogEnabled(projectId: string, enable: boolean): Promise<CatalogToggleResult> {
  if (!isCatalogFeatureUiEnabled()) return { ok: false, error: 'feature_disabled', message: 'Özellik kapalı' }
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) return { ok: false, error: 'not_found' }
  const { supabase, userId } = await requireUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id, owner_id, project_type, commerce_mode')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.owner_id !== userId) return { ok: false, error: 'not_found' }

  const [planCode, ordersRes] = await Promise.all([
    getPlanCodeForUser(userId),
    admin.from('ecommerce_orders').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  const blocker = catalogToggleBlocker({
    enable,
    projectType: project.project_type as string | null,
    commerceMode: project.commerce_mode as string | null,
    planCode,
    orders: ordersRes.count ?? 0,
  })
  if (blocker) {
    return {
      ok: false,
      error: blocker,
      ...(blocker === 'plan_required' ? { message: CATALOG_PLAN_WARNING } : {}),
    }
  }

  const next = catalogColumns(enable)
  const { error } = await admin.from('projects').update(next).eq('id', projectId)
  if (error) return { ok: false, error: 'update_failed' }

  const { error: auditError } = await admin.from('site_type_changes').insert({
    project_id: projectId,
    actor_id: userId,
    actor_email: user?.email ?? '',
    from_type: project.project_type ?? 'corporate',
    from_mode: project.commerce_mode ?? 'none',
    to_type: project.project_type ?? 'corporate',
    to_mode: next.commerce_mode,
    note: enable ? 'Katalog özelliği editörden açıldı' : 'Katalog özelliği editörden kapatıldı',
  })
  if (auditError) {
    await admin
      .from('projects')
      .update({ commerce_mode: project.commerce_mode ?? 'none' })
      .eq('id', projectId)
    return { ok: false, error: 'audit_failed' }
  }

  // Resolve once so the next read through the shared loader is fresh.
  await loadProjectCommerce({ id: projectId }).catch(() => null)
  revalidatePath('/dashboard')
  revalidatePath(`/editor/${projectId}`)
  return { ok: true, enabled: enable }
}
